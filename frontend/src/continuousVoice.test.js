import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContinuousVoice} from './continuousVoice.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({visible=async()=>true,watchDuplex,sentencePlayer}={}){
  const store=initial=>{let state=initial;const listeners=new Set();return{getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(patch){state={...state,...patch};listeners.forEach(fn=>fn());}};};
  const turn=store({phase:'idle',text:'',error:'',endpointWarning:''});let starts=0,sent=[],played=[],scheduled=[],delays=[],captureOptions=[];
  turn.cancel=()=>turn.emit({phase:'idle',error:'',endpointWarning:''});turn.edit=text=>turn.emit({text});turn.start=async(_stream,_before,options)=>{starts++;captureOptions.push(options);turn.emit({phase:'recording',text:''});};
  turn.recognizePCM=async()=>{turn.cancel();turn.emit({phase:'recognizing'});await Promise.resolve();turn.emit({phase:'ready',text:'新的问题'});};
  const chat=store({status:{configured:true},messages:[],busy:false,error:''});let id=0;
  chat.cancel=()=>{if(chat.getSnapshot().busy){chat.emit({busy:false,messages:chat.getSnapshot().messages.map(m=>m.status==='streaming'?{...m,status:'cancelled'}:m)});}};
  chat.submit=text=>{sent.push(text);chat.emit({messages:[...chat.getSnapshot().messages,{id:++id,role:'user',content:text},{id:++id,role:'assistant',content:'',status:'streaming'}],busy:true});return true;};
  const speech=store({voice:'local',phase:'idle',outcome:'idle',completedId:null,error:''});
  speech.stop=async()=>speech.emit({phase:'idle',outcome:'cancelled'});speech.loadVoices=async()=>{};
  speech.speak=async reply=>{played.push(reply.id);speech.emit({phase:'speaking',outcome:'playing',playingId:reply.id});return true;};
  const stream={getAudioTracks:()=>[{readyState:'live',enabled:true}]};
  const loop=createContinuousVoice({turn,chat,speech,sentencePlayer,watchDuplex,canContinue:visible,setTimer:(fn,ms)=>{scheduled.push(fn);delays.push(ms);return fn;},clearTimer:fn=>{scheduled=scheduled.filter(value=>value!==fn);}});loop.connect();
  const recognize=()=>turn.emit({phase:'ready',text:'今天看书'});
  const reply=()=>chat.emit({busy:false,messages:chat.getSnapshot().messages.map(m=>m.status==='streaming'?{...m,status:'complete',content:'一起开始吧'}:m)});
  return{loop,turn,chat,speech,stream,recognize,reply,stats:()=>({starts,sent,played,scheduled,delays,captureOptions}),runNext:()=>scheduled.shift()?.()};
}

function sentenceFixture(){
  let view={active:false,phase:'off',completedId:null,error:''};const listeners=new Set();
  const queue={getSnapshot:()=>view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},connect(){},dispose(){},
    emit(patch){view={...view,...patch};listeners.forEach(fn=>fn());},start(){queue.emit({active:true,phase:'waiting',completedId:null,error:''});},stop(){queue.emit({active:false,phase:'off',completedId:null});}};
  const f=fixture({sentencePlayer:queue});f.speech.speakSegment=async()=>true;return{...f,queue};
}

test('sentence mode waits for both model completion and queue drain, without a full-message replay',async()=>{
  const f=sentenceFixture();await f.loop.start(f.stream,'normal',{sentenceSpeech:true});f.recognize();await tick();
  assert.equal(f.loop.getSnapshot().phase,'segmented');f.reply();await tick();
  assert.equal(f.stats().scheduled.length,0);assert.equal(f.stats().played.length,0);
  f.speech.emit({phase:'idle',outcome:'completed',completedId:2});
  f.queue.emit({active:false,phase:'complete',completedId:2});
  assert.equal(f.loop.getSnapshot().phase,'cooldown');f.runNext();await tick();assert.equal(f.stats().starts,2);f.loop.dispose();
});

test('manual sentence-mode stop cannot recurse through queue events or resume from late completion',async()=>{
  const f=sentenceFixture();await f.loop.start(f.stream,'normal',{sentenceSpeech:true});f.recognize();await tick();
  f.loop.stop();f.queue.emit({active:false,phase:'complete',completedId:2});f.reply();await tick();
  assert.equal(f.loop.getSnapshot().active,false);assert.equal(f.stats().starts,1);assert.equal(f.stats().scheduled.length,0);f.loop.dispose();
});

test('chosen rhythm reaches capture, barge-in and the post-playback cooldown',async()=>{
  for(const [timing,cooldown] of [['fast',250],['normal',600],['relaxed',900]]){
    let options;const f=fixture({watchDuplex:(_stream,value)=>{options=value;return{stop(){}};}});
    await f.loop.start(f.stream,'normal',{timing,duplex:true});
    assert.equal(f.stats().captureOptions[0].timing,timing);
    f.recognize();await tick();assert.equal(options.timing,timing);
    f.reply();await tick();f.speech.emit({phase:'idle',outcome:'completed',completedId:2});
    assert.equal(f.stats().delays.at(-1),cooldown);
    f.loop.dispose();f.runNext();await tick();assert.equal(f.stats().starts,1);
  }
});
test('only one send per transcript and only natural playback completion starts another turn',async()=>{
  const f=fixture();await f.loop.start(f.stream);assert.equal(f.stats().starts,1);
  f.recognize();f.turn.emit({level:.2});await tick();assert.deepEqual(f.stats().sent,['今天看书']);
  f.reply();await tick();assert.deepEqual(f.stats().played,[2]);assert.equal(f.stats().starts,1);
  f.speech.emit({phase:'idle',outcome:'completed',completedId:2});assert.equal(f.loop.getSnapshot().phase,'cooldown');
  f.runNext();await tick();assert.equal(f.stats().starts,2);f.loop.dispose();
});
test('manual playback stop ends the loop without reopening capture',async()=>{
  const f=fixture();await f.loop.start(f.stream);f.recognize();await tick();f.reply();await tick();await f.speech.stop();
  assert.equal(f.loop.getSnapshot().active,false);assert.equal(f.stats().scheduled.length,0);assert.equal(f.stats().starts,1);
});
test('cancel during visibility check discards a late transcript',async()=>{
  let resolve,checks=0;const f=fixture({visible:()=>++checks===1?Promise.resolve(true):new Promise(r=>{resolve=r;})});
  await f.loop.start(f.stream);f.recognize();f.loop.stop();resolve(true);await tick();
  assert.deepEqual(f.stats().sent,[]);assert.equal(f.loop.getSnapshot().active,false);
});
test('hidden window, capture error and model failure stop continuous conversation',async()=>{
  for(const failure of ['hidden','capture','model']){
    let visible=true;const f=fixture({visible:async()=>visible});await f.loop.start(f.stream);
    if(failure==='capture')f.turn.emit({phase:'idle',error:'No sound'});
    else {if(failure==='hidden')visible=false;f.recognize();await tick();if(failure==='model')f.chat.emit({busy:false,messages:f.chat.getSnapshot().messages.map(m=>m.status==='streaming'?{...m,status:'error'}:m)});}
    await tick();assert.equal(f.loop.getSnapshot().active,false);assert.equal(f.stats().scheduled.length,0);
  }
});
test('stopping during cooldown invalidates even an already queued timer',async()=>{
  const f=fixture();await f.loop.start(f.stream);f.recognize();await tick();f.reply();await tick();f.speech.emit({phase:'idle',outcome:'completed',completedId:2});
  const queued=f.stats().scheduled[0];f.loop.stop();queued();await tick();assert.equal(f.stats().starts,1);
});
test('a different playback during listening or cooldown never leaks into the next recording',async()=>{
  for(const cooldown of [false,true]){
    const f=fixture();await f.loop.start(f.stream);
    if(cooldown){f.recognize();await tick();f.reply();await tick();f.speech.emit({phase:'idle',outcome:'completed',completedId:2});}
    f.speech.emit({phase:'speaking',outcome:'playing',playingId:999});assert.equal(f.loop.getSnapshot().active,false);assert.equal(f.stats().scheduled.length,0);
  }
});
test('missing model configuration or local voice never starts capture',async()=>{
  for(const missing of ['model','voice']){
    const f=fixture();if(missing==='model')f.chat.emit({status:{configured:false}});else f.speech.emit({voice:''});
    await f.loop.start(f.stream);assert.equal(f.stats().starts,0);assert.equal(f.loop.getSnapshot().active,false);
  }
});
test('playback failure preserves the text reply and stops without a retry loop',async()=>{
  const f=fixture();f.speech.speak=async()=>{f.speech.emit({phase:'error',outcome:'error',error:'Playback failed'});return true;};
  await f.loop.start(f.stream);f.recognize();await tick();f.reply();await tick();
  assert.equal(f.loop.getSnapshot().active,false);assert.equal(f.loop.getSnapshot().lastReply,'一起开始吧');assert.equal(f.stats().scheduled.length,0);
});
test('legacy or mismatched completion stops with restart guidance instead of waiting forever',async()=>{
  const f=fixture();await f.loop.start(f.stream);f.recognize();await tick();f.reply();await tick();
  f.speech.emit({phase:'idle',outcome:'playing',playingId:null});assert.equal(f.loop.getSnapshot().active,false);assert.match(f.loop.getSnapshot().error,/重新启动 Demo/);
});
test('speech during playback interrupts and the retained PCM sends a new turn once',async()=>{
  let callbacks;const f=fixture({watchDuplex:(_stream,value)=>{callbacks=value;return{stop(){}};}});
  await f.loop.start(f.stream,'normal',{duplex:true});f.recognize();await tick();f.reply();await tick();
  callbacks.onSpeech();assert.equal(f.loop.getSnapshot().phase,'interrupting');
  await callbacks.onPCM(new Uint8Array(6400));await tick();assert.deepEqual(f.stats().sent,['今天看书','新的问题']);assert.equal(f.loop.getSnapshot().active,true);
  f.loop.dispose();
});

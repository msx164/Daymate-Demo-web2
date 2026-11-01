import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceTurn,pcm16} from './voiceTurn.js';
const stream={getAudioTracks:()=>[{readyState:'live'}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}){
  const recorder={state:'inactive',mimeType:'audio/webm',start(){this.state='recording';},stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});void this.onstop?.();}};
  let captures=0,interrupted=0,cancelled=0;
  const turn=createVoiceTurn({makeRecorder:()=>{captures++;return recorder;},decode:async()=>new Uint8Array(6400),transcribe:async()=>({text:'今天看书',elapsed_ms:12}),cancelASR:async()=>{cancelled++;},interrupt:async()=>{interrupted++;},setTimer:()=>1,clearTimer:()=>{},...overrides});
  return {turn,recorder,stats:()=>({captures,interrupted,cancelled})};
}
test('float audio becomes clipped little-endian PCM16',()=>{
  const bytes=pcm16(new Float32Array([-2,-1,0,1,2,NaN]));
  assert.deepEqual([...new Int16Array(bytes.buffer)],[-32768,-32768,0,32767,32767,0]);
});
test('explicit stop recognizes locally; editing never sends chat',async()=>{
  const {turn,stats}=fixture();await turn.start(stream);assert.equal(turn.getSnapshot().phase,'recording');
  assert.equal(stats().interrupted,1);turn.finish();await tick();
  assert.equal(turn.getSnapshot().phase,'ready');assert.equal(turn.getSnapshot().text,'今天看书');
  turn.edit('明天工作');assert.equal(turn.getSnapshot().text,'明天工作');
});
test('cancel while preparing never starts recording',async()=>{
  let resolve;const {turn,stats}=fixture({interrupt:()=>new Promise(r=>{resolve=r;})});
  const start=turn.start(stream);turn.cancel();resolve();await start;assert.equal(stats().captures,0);
});
test('cancel while recognition is pending discards late transcript',async()=>{
  let resolve;const {turn}=fixture({transcribe:()=>new Promise(r=>{resolve=r;})});
  await turn.start(stream);turn.finish();await tick();turn.cancel();resolve({text:'late',elapsed_ms:1});await tick();
  assert.equal(turn.getSnapshot().phase,'idle');assert.equal(turn.getSnapshot().text,'');
});
test('device error stops recording and permits another attempt',async()=>{
  const {turn,recorder}=fixture();await turn.start(stream);recorder.onerror();assert.equal(recorder.state,'inactive');assert.match(turn.getSnapshot().error,/中断/);
  await turn.start(stream);assert.equal(turn.getSnapshot().phase,'recording');turn.cancel();
});
test('unexpected recorder stop cannot silently recognize or send a phrase',async()=>{
  let decoded=false;const {turn,recorder}=fixture({decode:async()=>{decoded=true;return new Uint8Array(6400);}});
  await turn.start(stream);recorder.stop();await tick();assert.equal(decoded,false);assert.match(turn.getSnapshot().error,/中断/);
});
test('automatic endpoint recognizes exactly once and disposes monitoring',async()=>{
  let callbacks,stopped=0;
  const {turn}=fixture({watchPause:(_stream,value)=>{callbacks=value;return{stop(){stopped++;}};}});
  await turn.start(stream,undefined,{autoEnd:true});callbacks.onState({state:'sound',level:.5});
  assert.equal(turn.getSnapshot().endpoint,'sound');callbacks.onEnd();callbacks.onEnd();await tick();
  assert.equal(turn.getSnapshot().phase,'ready');assert.equal(stopped,1);
});
test('no sound cancels instead of recognizing, late detector events are ignored',async()=>{
  let callbacks,decoded=0;
  const {turn}=fixture({decode:async()=>{decoded++;},watchPause:(_stream,value)=>{callbacks=value;return{stop(){}};}});
  await turn.start(stream,undefined,{autoEnd:true});callbacks.onEmpty();callbacks.onEnd();await tick();
  assert.equal(turn.getSnapshot().phase,'idle');assert.equal(decoded,0);assert.match(turn.getSnapshot().error,/8 秒/);
});
test('monitor failure retains manual finish; ordinary mode never starts detector',async()=>{
  let started=0;const {turn}=fixture({watchPause:()=>{started++;throw Error('Unavailable');}});
  await turn.start(stream);assert.equal(started,0);turn.cancel();
  await turn.start(stream,undefined,{autoEnd:true});assert.equal(turn.getSnapshot().phase,'recording');assert.equal(turn.getSnapshot().endpoint,'unavailable');
  turn.finish();await tick();assert.equal(turn.getSnapshot().phase,'ready');
});

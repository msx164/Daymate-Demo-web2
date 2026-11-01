export function pcm16(samples) {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
  for (let i=0;i<samples.length;i++) { const value=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0)); view.setInt16(i*2,Math.round(value*(value<0?32768:32767)),true); }
  return bytes;
}
export async function decodeVoice(blob) {
  if (blob.size > 2*1024*1024) throw Error('语音片段过大，请缩短后重试。');
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 30.5 || decoded.duration < .1) throw Error('请说一段 0.1–30 秒的语音。');
    const offline = new OfflineAudioContext(1, Math.min(480000,Math.ceil(decoded.duration*16000)),16000);
    const source = offline.createBufferSource(); source.buffer=decoded;source.connect(offline.destination);source.start();
    return pcm16((await offline.startRendering()).getChannelData(0));
  } finally { await decoder.close(); }
}
export function createVoiceTurn({makeRecorder,decode,transcribe,cancelASR,interrupt,watchPause,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let view={phase:'idle',text:'',error:'',elapsed:null,warm:false,modelLoadMs:null,endpoint:'off',level:0,endpointWarning:''},revision=0,recorder,timer,monitor,chunks=[],listeners=new Set();
  const emit=patch=>{view={...view,...patch};listeners.forEach(fn=>fn());};
  const stopMonitor=()=>{monitor?.stop();monitor=null;};
  function cancel() {
    revision++;clearTimer(timer);stopMonitor();chunks=[];
    if(recorder){recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();recorder=null;}
    Promise.resolve(cancelASR()).catch(()=>{});emit({phase:'idle',error:'',endpoint:'off',level:0,endpointWarning:''});
  }
  function finish() { if(view.phase!=='recording')return;clearTimer(timer);stopMonitor();emit({phase:'recognizing',endpoint:'off',level:0});recorder.stop(); }
  async function start(stream, beforeStart = interrupt, {autoEnd=false,sensitivity='normal',timing='normal'}={}) {
    if(!stream?.getAudioTracks().some(track=>track.readyState==='live')){emit({error:'请先开启麦克风。'});return;}
    cancel();const current=revision;emit({phase:'preparing',text:'',error:'',elapsed:null,warm:false,modelLoadMs:null});
    try {
      await beforeStart();if(current!==revision)return;
      const instance=makeRecorder(stream);recorder=instance;chunks=[];let size=0;
      instance.ondataavailable=event=>{if(current!==revision)return;if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>2*1024*1024){cancel();emit({error:'语音片段过大，请重试。'});}}};
      instance.onerror=()=>{if(current===revision){cancel();emit({error:'录音中断，请检查设备后重试。'});}};
      instance.onstop=async()=>{
        if(current!==revision)return;
        if(view.phase!=='recognizing'){cancel();emit({error:'语音采集中断，请重新开始。'});return;}
        const blob=new Blob(chunks,{type:instance.mimeType});chunks=[];recorder=null;
        try{
          const pcm=await decode(blob);if(current!==revision)return;
          const result=await transcribe(pcm);if(current!==revision)return;
          emit({phase:'ready',text:result.text,error:result.text.trim()?'':'没有识别到清晰语音，请重试或输入文字。',elapsed:result.elapsed_ms,warm:result.warm===true,modelLoadMs:result.model_load_ms??null});
        }catch(error){if(current===revision)emit({phase:'idle',error:error.message||'本机识别失败，请重试。'});}
      };
      instance.start(250);emit({phase:'recording'});timer=setTimer(finish,30000);
      if(autoEnd&&watchPause){
        const recording=()=>current===revision&&view.phase==='recording';
        const warning=message=>{if(recording())emit({endpoint:'unavailable',level:0,endpointWarning:message});};
        emit({endpoint:'waiting'});
        try{monitor=watchPause(stream,{sensitivity,timing,
          onState:({state,level})=>{if(recording())emit({endpoint:state,level});},
          onEnd:()=>{if(recording())finish();},
          onEmpty:()=>{if(recording()){cancel();emit({error:'等待 8 秒仍未检测到持续声音，已取消本段采集；可调整灵敏度或使用手动结束。'});}},
          onError:warning,
        });}catch(error){warning(error.message);}
      }
    }catch(error){if(current===revision){cancel();emit({error:error.message||'无法开始语音。'});}}
  }
  async function recognizePCM(pcm){
    cancel();const current=revision;emit({phase:'recognizing',text:'',error:'',elapsed:null,warm:false,modelLoadMs:null});
    try{const result=await transcribe(pcm);if(current===revision)emit({phase:'ready',text:result.text,error:result.text.trim()?'':'没有识别到清晰语音，请重新开始。',elapsed:result.elapsed_ms,warm:result.warm===true,modelLoadMs:result.model_load_ms??null});}
    catch(error){if(current===revision)emit({phase:'idle',error:error.message||'识别失败。'});}
  }
  return {start,finish,cancel,recognizePCM,getSnapshot:()=>view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},edit(text){emit({text:text.slice(0,4000)});}};
}

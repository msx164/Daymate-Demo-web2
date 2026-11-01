import {createPauseDetector,rms,VOICE_THRESHOLDS} from './voiceEndpoint.js';
import {pcm16} from './voiceTurn.js';
import {voiceTiming} from './voiceTiming.js';
export function createDuplexSegment({onSpeech,onPCM,onError,sensitivity='normal',timing='normal'}){
  const detect=createPauseDetector({threshold:VOICE_THRESHOLDS[sensitivity]||VOICE_THRESHOLDS.normal,waitMs:Infinity,silenceMs:voiceTiming(timing).silenceMs});
  let prefix=[],chunks=[],length=0,triggered=false,ended=false,time=0;
  return{push(samples){
    if(ended)return;time+=samples.length/16;
    const state=detect(rms(samples),time).state;
    if(!triggered){prefix.push(samples.slice());while(prefix.reduce((n,c)=>n+c.length,0)>12000&&prefix.length>1)prefix.shift();
      if(state==='sound'){triggered=true;chunks=prefix;length=chunks.reduce((n,c)=>n+c.length,0);prefix=[];onSpeech();}
    }else{chunks.push(samples.slice());length+=samples.length;}
    if(triggered&&(state==='end'||length>=480000)){
      ended=true;const result=new Float32Array(Math.min(length,480000));let offset=0;
      for(const chunk of chunks){const count=Math.min(chunk.length,result.length-offset);if(count<=0)break;result.set(chunk.subarray(0,count),offset);offset+=count;}
      chunks=[];onPCM(pcm16(result));
    }else if(state==='interrupted'){ended=true;onError('同时收音中断，请重新开始。');}
  },stop(){ended=true;prefix=[];chunks=[];},get triggered(){return triggered;}};
}
export function watchDuplexSpeech(stream,callbacks){
  const context=new AudioContext({sampleRate:16000,latencyHint:'interactive'});
  let active=true,source,node,gain;
  const segment=createDuplexSegment({...callbacks,onPCM:pcm=>{stop();callbacks.onPCM(pcm);}});
  function stop(){if(!active)return;active=false;segment.stop();if(node)node.port.onmessage=null;source?.disconnect();node?.disconnect();gain?.disconnect();void context.close().catch(()=>{});}
  void(async()=>{
    try{
      if(context.sampleRate!==16000)throw Error('Unsupported sample rate');
      await context.audioWorklet.addModule(new URL('./audio/duplex-capture.worklet.js',import.meta.url));
      if(!active)return;
      source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'daymate-duplex-capture');gain=context.createGain();gain.gain.value=0;
      node.port.onmessage=event=>{if(active){try{segment.push(event.data);}catch{stop();callbacks.onError('同时收音失败，请重新开始。');}}};
      source.connect(node);node.connect(gain);gain.connect(context.destination);await context.resume();
    }catch{if(active){stop();callbacks.onError('同时收音不可用，请改用轮流对话。');}}
  })();
  return{stop};
}

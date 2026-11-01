import { modelPath } from './live2dPreflight.js';
const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
export function motionClips(model,entry) {
  modelPath(entry);const prefix=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'', result=[];
  const groups=model?.FileReferences?.Motions;
  if(groups===undefined)return result;
  if(!groups || typeof groups!=='object' || Array.isArray(groups))throw Error('动作组无效。');
  for(const [group,clips] of Object.entries(groups)) {
    if(!Array.isArray(clips) || group.length>120)throw Error('动作组无效。');
    for(const [index,clip] of clips.entries()) {
      const file=modelPath(clip?.File);if(!file.endsWith('.motion3.json') || result.length>=64)throw Error('最多支持 64 个包内 motion3 动作。');
      result.push({id:String(result.length),label:`${group.slice(0,60)} · ${index+1}`,file:prefix+file});
    }
  }
  return result;
}
// Validate and reconstruct a bounded subset before handing it to Cubism; events and audio never enter playback.
export function prepareMotion(buffer) {
  if(!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength>1024*1024)throw Error('动作文件超过 1 MiB 或为空。');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'')),meta=data?.Meta;
  if(data?.Version!==3 || !meta || !finite(meta.Duration,.01,120) || !finite(meta.Fps,1,120)
    || !Array.isArray(data.Curves) || !data.Curves.length || data.Curves.length>256 || meta.CurveCount!==data.Curves.length)throw Error('动作时长、帧率或曲线预算无效。');
  let segments=0,points=0;
  const curves=data.Curves.map(curve=>{
    if(!['Model','Parameter','PartOpacity'].includes(curve?.Target) || typeof curve.Id!=='string' || !curve.Id || curve.Id.length>120 || [...curve.Id].some(char=>char.charCodeAt(0)<32))throw Error('动作曲线类型或参数无效。');
    const values=curve.Segments;
    if(!Array.isArray(values) || values.length<2 || values.length>50000 || !values.every(value=>finite(value,-10000,10000)) || !finite(values[0],0,meta.Duration))throw Error('动作段数据无效。');
    let last=values[0],offset=2;points++;
    while(offset<values.length) {
      const type=values[offset++],size=type===1?6:[0,2,3].includes(type)?2:0;
      if(!size || offset+size>values.length)throw Error('动作段类型或长度无效。');
      let time=last;
      for(let i=0;i<size;i+=2){const next=values[offset+i];if(!finite(next,time,meta.Duration+.001))throw Error('动作时间必须递增且位于时长内。');time=next;}
      if(time<=last)throw Error('动作段必须具有正时长。');
      last=time;offset+=size;segments++;points+=size/2;
      if(segments>8192 || points>24576)throw Error('动作段或控制点超出预算。');
    }
    const next={Target:curve.Target,Id:curve.Id,Segments:[...values]};
    for(const key of ['FadeInTime','FadeOutTime'])if(curve[key]!==undefined){if(!finite(curve[key],-1,10))throw Error('动作淡入淡出无效。');next[key]=curve[key];}
    return next;
  });
  if(meta.TotalSegmentCount!==segments || meta.TotalPointCount!==points)throw Error('动作声明的段数／控制点数不匹配。');
  const output={Version:3,Meta:{Duration:meta.Duration,Fps:meta.Fps,Loop:false,AreBeziersRestricted:meta.AreBeziersRestricted===true,
    CurveCount:curves.length,TotalSegmentCount:segments,TotalPointCount:points,UserDataCount:0,TotalUserDataSize:0},Curves:curves};
  const bytes=new TextEncoder().encode(JSON.stringify(output));
  return {buffer:bytes.buffer,duration:meta.Duration,parameters:curves.filter(curve=>curve.Target==='Parameter').map(curve=>curve.Id)};
}
export function nativeMotionRequest(action,id) {
  if(!['play','pause','resume','stop'].includes(action))return null;
  if(action==='play' && (typeof id!=='string' || !/^(?:[0-9]|[1-5][0-9]|6[0-3])$/.test(id)))return null;
  return action==='play'?{action,id}:{action};
}

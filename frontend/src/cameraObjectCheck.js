import {objectEvidence,TASK_OBJECTS,objectThreshold,OBJECT_SCORE_PROFILES} from './objectObservation.js';
import {normalizeCameraRegion} from './cameraRegion.js';

export function cameraCheckSummary(records){
  const counts={matched:0,missed:0,falsePositive:0,correctAbsence:0};
  for(const record of records){
    if(record.expected&&record.detected)counts.matched++;
    else if(record.expected)counts.missed++;
    else if(record.detected)counts.falsePositive++;
    else counts.correctAbsence++;
  }
  return counts;
}
export function cameraCheckExport(records){
  // Explicit whitelist: no stream, opaque context, frames, device IDs or faces.
  return{schema:'daymate.camera-check.v2',model:'efficientdet_lite0/int8/1',samples:records.map(({id,label,expected,detected,score,checkedAt,region,width,height,threshold})=>({id,label,expected,detected,score,checkedAt,region:normalizeCameraRegion(region),width,height,threshold:objectThreshold(threshold)}))};
}
export function cameraCheckThresholdGroups(records){
  return Object.values(OBJECT_SCORE_PROFILES).map(profile=>{const samples=records.filter(record=>objectThreshold(record.threshold)===profile.threshold);return{...profile,total:samples.length,...cameraCheckSummary(samples)};}).filter(group=>group.total>0);
}
export function createCameraObjectCheck({clock=()=>performance.now(),wallClock=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),timeoutMs=5000}={}){
  let snapshot={pending:null,records:[],status:'idle'},sequence=0,timer;
  const listeners=new Set();
  const publish=value=>{snapshot=value;for(const listener of [...listeners])listener();};
  function stop(status='cancelled'){
    cancel(timer);timer=null;
    if(snapshot.pending)publish({...snapshot,pending:null,status});
  }
  return{
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>snapshot,
    begin(label,expected,context){
      if(!Object.hasOwn(TASK_OBJECTS,label)||typeof expected!=='boolean'||!context||snapshot.pending)return false;
      const now=clock();if(!Number.isFinite(now))return false;
      const pending={id:++sequence,label,expected,context,requestedAt:now};
      publish({...snapshot,pending,status:'waiting'});
      timer=schedule(()=>{if(snapshot.pending?.id===pending.id)stop('timeout');},timeoutMs);
      return true;
    },
    observe({context,timestamp,state,objects,region,width,height,threshold=.55}){
      const pending=snapshot.pending,now=clock();
      if(!pending||pending.context!==context||!['observing','phone-visible'].includes(state))return false;
      if(!Number.isFinite(timestamp)||timestamp<pending.requestedAt||!Number.isFinite(now)||now<timestamp||now-timestamp>3000)return false;
      threshold=objectThreshold(threshold);
      const evidence=objectEvidence(objects,threshold);
      if(!evidence||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16384||height>16384)return false;
      const target=evidence.find(item=>item.label===pending.label);
      const record={id:pending.id,label:pending.label,expected:pending.expected,detected:!!target,score:target?.score??null,checkedAt:new Date(wallClock()).toISOString(),region:normalizeCameraRegion(region),width,height,threshold};
      cancel(timer);timer=null;
      publish({pending:null,records:[...snapshot.records,record].slice(-30),status:'done'});return true;
    },
    cancel:stop,
    clear(){stop();publish({pending:null,records:[],status:'idle'});},
  };
}

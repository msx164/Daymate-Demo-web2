export const CAMERA_DIAGNOSTIC_KINDS=Object.freeze({face:'在场观察',posture:'姿态观察',objects:'物体观察'});
const empty=()=>({active:0,ready:0,starts:0,frames:0,results:0,accepted:0,discarded:0,failures:0,timings:[]});
export function cameraTimingSummary(timings,key){
  if(!timings.length)return null;
  const values=timings.map(item=>item[key]);
  return {count:values.length,average:values.reduce((sum,value)=>sum+value,0)/values.length,max:Math.max(...values)};
}
// Page-local counters and a bounded timing window, never frame or model output.
export function createCameraDiagnostics(){
  let snapshot=Object.fromEntries(Object.keys(CAMERA_DIAGNOSTIC_KINDS).map(kind=>[kind,empty()]));
  const listeners=new Set();
  function update(kind,change){snapshot={...snapshot,[kind]:change(snapshot[kind])};for(const listener of [...listeners])listener();}
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>snapshot,
    open(kind){
      if(!Object.hasOwn(CAMERA_DIAGNOSTIC_KINDS,kind))return null;
      let stopped=false,ready=false;
      update(kind,value=>({...value,active:value.active+1,starts:value.starts+1}));
      return {
        ready(){if(stopped||ready)return;ready=true;update(kind,value=>({...value,ready:value.ready+1}));},
        frame(){if(!stopped)update(kind,value=>({...value,frames:value.frames+1}));},
        result({durationMs,elapsedMs,accepted}){
          if(stopped||!Number.isFinite(durationMs)||durationMs<0||!Number.isFinite(elapsedMs)||elapsedMs<0||typeof accepted!=='boolean')return;
          update(kind,value=>({...value,results:value.results+1,accepted:value.accepted+Number(accepted),discarded:value.discarded+Number(!accepted),timings:[...value.timings,{durationMs,elapsedMs}].slice(-30)}));
        },
        stop(failed=false){
          if(stopped)return;stopped=true;
          update(kind,value=>({...value,active:value.active-1,ready:value.ready-Number(ready),failures:value.failures+Number(failed)}));
        },
      };
    },
  };
}

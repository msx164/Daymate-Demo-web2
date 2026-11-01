// One frame in flight per worker; no frame backlog or main-thread ML fallback.
export function createCameraInference({kind,video,stream,onResult,onStatus,interval=500,diagnostics,
  workerFactory=()=>new Worker('/vision/observer-worker.js'),
  capture=element=>{
    const scale=Math.min(1,640/Math.max(element.videoWidth,element.videoHeight));
    return createImageBitmap(element,{resizeWidth:Math.max(1,Math.round(element.videoWidth*scale)),resizeHeight:Math.max(1,Math.round(element.videoHeight*scale)),resizeQuality:'low'});
  },clock=()=>performance.now(),hidden=()=>document.hidden,
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),
  initTimeout=20000,frameTimeout=5000,maxAge=3000,
}){
  let worker,stopped=false,ready=false,timer,watchdog,pending=null,sequence=0,lastFrame=-1,lastFresh=clock();
  const diagnostic=diagnostics?.open(kind);
  function dispose(failed=false){if(stopped)return;stopped=true;cancel(timer);cancel(watchdog);pending=null;if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}diagnostic?.stop(failed);}
  function fail(reason){if(stopped)return;dispose(true);onStatus({state:'unavailable',reason});}
  const later=()=>{if(!stopped)timer=schedule(sample,interval);};
  function unavailable(reason){onStatus({state:'unknown',reason});}
  async function sample(){
    if(stopped||!ready||pending)return;
    const element=video(),now=clock();
    if(hidden()){unavailable('hidden');lastFresh=now;later();return;}
    if(!element||element.readyState<2||!element.videoWidth||!element.videoHeight){unavailable('not-ready');later();return;}
    if(!stream.getVideoTracks().some(track=>track.readyState==='live')){unavailable('camera-ended');later();return;}
    if(element.currentTime===lastFrame){if(now-lastFresh>maxAge)unavailable('frozen');later();return;}
    lastFrame=element.currentTime;lastFresh=now;
    const job={id:++sequence,timestamp:now};pending=job;
    diagnostic?.frame();
    watchdog=schedule(()=>fail('frame-timeout'),frameTimeout);
    let bitmap;
    try{
      bitmap=await capture(element);
      if(stopped||pending!==job){bitmap.close();return;}
      if(hidden()||!stream.getVideoTracks().some(track=>track.readyState==='live')){
        bitmap.close();pending=null;cancel(watchdog);unavailable('interrupted');later();return;
      }
      if(clock()-now>maxAge){bitmap.close();pending=null;cancel(watchdog);unavailable('slow');later();return;}
      worker.postMessage({type:'frame',id:job.id,timestamp:now,bitmap},[bitmap]);
    }catch{bitmap?.close();fail('capture-error');}
  }
  try{
    worker=workerFactory();
    worker.onmessage=({data})=>{
      if(stopped)return;
      if(data.type==='error'){fail(ready?'inference-error':'model-error');return;}
      if(data.type==='ready'){
        if(ready)return;ready=true;diagnostic?.ready();cancel(watchdog);void sample();return;
      }
      if(data.type!=='result'||!pending||data.id!==pending.id)return;
      const job=pending;pending=null;cancel(watchdog);
      if(!Number.isInteger(data.count)||data.count<0||!Number.isFinite(data.durationMs)||data.durationMs<0){fail('invalid-result');return;}
      if(kind==='objects'&&(!Array.isArray(data.objects)||data.objects.length>10)){fail('invalid-result');return;}
      const interrupted=hidden()||!stream.getVideoTracks().some(track=>track.readyState==='live'),elapsedMs=clock()-job.timestamp;
      diagnostic?.result({durationMs:data.durationMs,elapsedMs,accepted:!interrupted&&elapsedMs<=maxAge});
      if(interrupted)unavailable('interrupted');
      else if(elapsedMs>maxAge)unavailable('slow');
      else onResult({count:data.count,matrix:data.matrix,objects:data.objects,durationMs:data.durationMs,timestamp:job.timestamp});
      later();
    };
    worker.onerror=()=>fail('worker-error');worker.onmessageerror=()=>fail('worker-message-error');
    watchdog=schedule(()=>fail('init-timeout'),initTimeout);
    worker.postMessage({type:'init',kind});
  }catch{fail('startup-error');}
  return {dispose};
}

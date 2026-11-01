import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraInference} from './cameraInference.js';
import {createCameraDiagnostics} from './cameraDiagnostics.js';
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture(extra={}){
  const f={now:0,hidden:false,ended:false,sent:[],results:[],statuses:[],terminated:0,closed:0};
  let serial=0;const timers=new Map();
  f.element={readyState:2,videoWidth:640,videoHeight:480,currentTime:0};
  f.worker={postMessage:message=>f.sent.push(message),terminate:()=>f.terminated++};
  f.emit=data=>f.worker.onmessage?.({data});
  f.bitmap=()=>({close:()=>f.closed++});
  f.session=createCameraInference({kind:'posture',video:()=>f.element,stream:{getVideoTracks:()=>[{readyState:f.ended?'ended':'live'}]},
    workerFactory:()=>f.worker,capture:async()=>f.bitmap(),clock:()=>f.now,hidden:()=>f.hidden,
    schedule:(fn,ms)=>{timers.set(++serial,{fn,time:f.now+ms});return serial;},cancel:id=>timers.delete(id),
    onResult:r=>f.results.push(r),onStatus:s=>f.statuses.push(s),...extra});
  f.advance=async ms=>{const end=f.now+ms;for(;;){const due=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!due)break;f.now=due[1].time;timers.delete(due[0]);due[1].fn();await flush();}f.now=end;await flush();};
  f.ready=async()=>{f.emit({type:'ready'});await flush();};
  f.finish=(values={})=>f.emit({type:'result',id:f.sent.at(-1).id,count:1,matrix:[],durationMs:10,...values});
  return f;
}
test('worker must be ready; each inference completes before the next frame',async()=>{
  const f=fixture();assert.deepEqual(f.sent,[{type:'init',kind:'posture'}]);
  await f.ready();assert.equal(f.sent.length,2);
  f.element.currentTime=1;await f.advance(1000);assert.equal(f.sent.length,2);
  f.finish();assert.equal(f.results.length,1);await f.advance(499);assert.equal(f.sent.length,2);
  await f.advance(1);assert.equal(f.sent.length,3);f.session.dispose();
});
test('late or mismatched results cannot release an unrelated in-flight job',async()=>{
  const f=fixture();await f.ready();f.finish({id:99});assert.equal(f.results.length,0);
  await f.advance(1000);assert.equal(f.sent.length,2);f.finish();assert.equal(f.results.length,1);f.session.dispose();
});
test('results over three seconds old or received after camera interruption are unknown',async()=>{
  const f=fixture();await f.ready();await f.advance(3100);f.finish();assert.equal(f.results.length,0);assert.equal(f.statuses.at(-1).reason,'slow');f.session.dispose();
  for(const flag of ['hidden','ended']){const q=fixture();await q.ready();q[flag]=true;q.finish();assert.equal(q.results.length,0);assert.equal(q.statuses.at(-1).state,'unknown');q.session.dispose();}
});
test('frozen video is never counted repeatedly as fresh evidence',async()=>{
  const f=fixture();await f.ready();f.finish();await f.advance(4000);
  assert.equal(f.sent.length,2);assert.equal(f.results.length,1);assert.equal(f.statuses.at(-1).reason,'frozen');f.session.dispose();
});
test('loading and in-flight timeouts terminate worker exactly once',async()=>{
  for(const ready of [false,true]){const f=fixture();if(ready)await f.ready();await f.advance(ready?5000:20000);assert.equal(f.terminated,1);assert.deepEqual(f.statuses.at(-1),{state:'unavailable',reason:ready?'frame-timeout':'init-timeout'});f.session.dispose();assert.equal(f.terminated,1);}
});
test('disposing during bitmap capture closes late bitmap without posting or committing',async()=>{
  let resolve;const f=fixture({capture:()=>new Promise(r=>{resolve=r;})});await f.ready();
  const staleHandler=f.worker.onmessage;f.session.dispose();resolve(f.bitmap());await flush();
  staleHandler({data:{type:'result',id:1,count:0,durationMs:1}});
  assert.equal(f.closed,1);assert.equal(f.sent.length,1);assert.equal(f.results.length,0);assert.equal(f.terminated,1);
});
test('capture timeout also closes a bitmap which resolves after termination',async()=>{
  let resolve;const f=fixture({capture:()=>new Promise(r=>{resolve=r;})});await f.ready();await f.advance(5000);resolve(f.bitmap());await flush();assert.equal(f.closed,1);assert.equal(f.terminated,1);
});
test('worker errors and malformed results fail closed without starting another worker',async()=>{
  for(const [error,reason] of [['onerror','worker-error'],['onmessageerror','worker-message-error'],['invalid-result','invalid-result']]){const f=fixture();await f.ready();if(error==='invalid-result')f.finish({count:-1});else f.worker[error]({message:'private runtime details'});assert.equal(f.terminated,1);assert.deepEqual(f.statuses.at(-1),{state:'unavailable',reason});assert.equal(f.results.length,0);}
});

test('model initialization and runtime errors have distinct bounded reasons, not worker payloads',async()=>{
  for(const ready of [false,true]){
    const f=fixture();if(ready)await f.ready();f.emit({type:'error',message:'private runtime details',reason:{untrusted:true}});
    assert.deepEqual(f.statuses,[{state:'unavailable',reason:ready?'inference-error':'model-error'}]);
    assert.equal(f.terminated,1);await f.advance(25000);assert.equal(f.statuses.length,1);assert.equal(f.results.length,0);
  }
});

test('startup and capture errors terminate safely and expose no exception text',async()=>{
  const startup=fixture({workerFactory:()=>{throw Error('private path');}});
  assert.deepEqual(startup.statuses,[{state:'unavailable',reason:'startup-error'}]);await startup.advance(25000);assert.equal(startup.statuses.length,1);
  const capture=fixture({capture:async()=>{throw Error('private device details');}});await capture.ready();
  assert.deepEqual(capture.statuses,[{state:'unavailable',reason:'capture-error'}]);assert.equal(capture.terminated,1);assert.equal(capture.sent.length,1);
});
test('object workers require bounded evidence arrays and pass valid evidence to the policy',async()=>{
  const f=fixture({kind:'objects'});await f.ready();f.finish({objects:[{label:'book',score:.8}]});assert.deepEqual(f.results[0].objects,[{label:'book',score:.8}]);f.session.dispose();
  for(const objects of [undefined,Array(11).fill({label:'book',score:.8})]){const q=fixture({kind:'objects'});await q.ready();q.finish({objects});assert.equal(q.terminated,1);assert.equal(q.results.length,0);}
});

test('diagnostics distinguish fresh and expired returns and terminate once on failure',async()=>{
  const diagnostics=createCameraDiagnostics(),f=fixture({diagnostics});
  assert.equal(diagnostics.getSnapshot().posture.active,1);await f.ready();await f.advance(20);f.finish();
  f.element.currentTime=1;await f.advance(500);await f.advance(3100);f.finish({durationMs:90});
  let value=diagnostics.getSnapshot().posture;
  assert.equal(value.frames,2);assert.equal(value.results,2);assert.equal(value.accepted,1);assert.equal(value.discarded,1);
  assert.deepEqual(value.timings,[{durationMs:10,elapsedMs:20},{durationMs:90,elapsedMs:3100}]);
  f.worker.onerror();f.session.dispose();value=diagnostics.getSnapshot().posture;
  assert.equal(value.active,0);assert.equal(value.ready,0);assert.equal(value.failures,1);
});

test('cancelled capture and malformed returns never appear as successful diagnostic samples',async()=>{
  const diagnostics=createCameraDiagnostics();let resolve;
  const f=fixture({diagnostics,capture:()=>new Promise(r=>{resolve=r;})});await f.ready();f.session.dispose();resolve(f.bitmap());await flush();
  const q=fixture({diagnostics});await q.ready();q.finish({count:-1});
  const value=diagnostics.getSnapshot().posture;
  assert.equal(value.starts,2);assert.equal(value.frames,2);assert.equal(value.results,0);assert.equal(value.active,0);assert.equal(value.failures,1);assert.deepEqual(value.timings,[]);
});

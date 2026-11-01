import test from 'node:test';import assert from 'node:assert/strict';
import {createCameraObjectCheck,cameraCheckSummary,cameraCheckExport,cameraCheckThresholdGroups} from './cameraObjectCheck.js';
function fixture(){
  let now=1000,timer;const context={},check=createCameraObjectCheck({clock:()=>now,wallClock:()=>Date.UTC(2026,9,21,0,0,now),schedule:fn=>{timer=fn;return fn;},cancel:fn=>{if(timer===fn)timer=null;}});
  return{check,context,setTime:value=>{now=value;},timeout:()=>timer?.(),frame:(value={})=>check.observe({context,timestamp:now,state:'observing',objects:[{label:'laptop',score:.8}],region:{x:0,y:0,width:1,height:1},width:640,height:480,...value})};
}
test('checks only consume the first valid sample captured after the explicit request',()=>{
  const f=fixture();assert.equal(f.check.begin('laptop',true,f.context),true);
  assert.equal(f.frame({timestamp:999}),false);assert.equal(f.check.getSnapshot().records.length,0);
  f.setTime(1500);assert.equal(f.frame(),true);assert.equal(f.frame(),false);
  const record=f.check.getSnapshot().records[0];assert.equal(record.detected,true);assert.equal(record.expected,true);assert.equal(record.score,.8);assert.equal(f.check.getSnapshot().pending,null);
});
test('invalid inputs, stale samples, unknown states and mismatched contexts never become results',()=>{
  const f=fixture();assert.equal(f.check.begin('face',true,f.context),false);assert.equal(f.check.begin('laptop','yes',f.context),false);
  f.check.begin('laptop',true,f.context);assert.equal(f.check.begin('book',false,f.context),false);
  for(const data of [{context:{}},{state:'unknown'},{width:0},{objects:null},{timestamp:NaN},{timestamp:2000}])assert.equal(f.frame(data),false);
  f.setTime(5000);assert.equal(f.frame({timestamp:1000}),false);assert.equal(f.check.getSnapshot().records.length,0);
});
test('cancelled requests and their late samples or timer callbacks cannot append records',()=>{
  const f=fixture();f.check.begin('laptop',true,f.context);f.check.cancel('interrupted');f.timeout();
  assert.equal(f.frame(),false);assert.equal(f.check.getSnapshot().status,'interrupted');assert.equal(f.check.getSnapshot().records.length,0);
});
test('timeout is an unavailable check rather than a false negative',()=>{
  const f=fixture();f.check.begin('cell phone',true,f.context);f.timeout();
  assert.equal(f.check.getSnapshot().status,'timeout');assert.equal(f.frame(),false);assert.equal(f.check.getSnapshot().records.length,0);
});
test('user confirmation and detection distinguish four outcomes without estimating accuracy',()=>{
  const f=fixture();for(const [expected,objects] of [[true,[{label:'laptop',score:.8}]],[true,[]],[false,[{label:'laptop',score:.9}]],[false,[]]]){f.check.begin('laptop',expected,f.context);f.frame({objects});}
  assert.deepEqual(cameraCheckSummary(f.check.getSnapshot().records),{matched:1,missed:1,falsePositive:1,correctAbsence:1});
});
test('records are bounded and clearing does not accept an old pending request',()=>{
  const f=fixture();for(let i=0;i<35;i++){f.setTime(1000+i);f.check.begin('laptop',true,f.context);f.frame();}
  assert.equal(f.check.getSnapshot().records.length,30);assert.equal(f.check.getSnapshot().records[0].id,6);
  f.check.begin('book',true,f.context);f.check.clear();assert.equal(f.frame(),false);assert.equal(f.check.getSnapshot().records.length,0);assert.equal(f.check.getSnapshot().status,'idle');
});
test('export explicitly excludes source images, contexts, extra region fields and device IDs',()=>{
  const f=fixture();f.check.begin('laptop',true,f.context);f.frame();const record=f.check.getSnapshot().records[0];
  const exported=cameraCheckExport([{...record,context:{},deviceId:'private',image:'private',region:{...record.region,frame:'private'}}]);
  assert.equal(exported.schema,'daymate.camera-check.v2');assert.equal(exported.samples.length,1);assert.equal(JSON.stringify(exported).includes('private'),false);
  assert.deepEqual(Object.keys(exported.samples[0]).sort(),['checkedAt','detected','expected','height','id','label','region','score','width','threshold'].sort());
});
test('snapshots stay stable until a change and subscriptions can be removed',()=>{
  const f=fixture(),first=f.check.getSnapshot();let changes=0;
  assert.equal(first,f.check.getSnapshot());const stop=f.check.subscribe(()=>changes++);f.check.begin('book',true,f.context);assert.equal(changes,1);stop();f.check.cancel();assert.equal(changes,1);
});
test('self-check applies the selected threshold and exports it per sample',()=>{
  const f=fixture(),objects=[{label:'laptop',score:.5}];
  f.check.begin('laptop',true,f.context);f.frame({objects,threshold:.4});
  f.check.begin('laptop',true,f.context);f.frame({objects,threshold:.75});
  const records=f.check.getSnapshot().records;assert.equal(records[0].detected,true);assert.equal(records[1].detected,false);
  assert.deepEqual(cameraCheckExport(records).samples.map(x=>x.threshold),[.4,.75]);
  assert.deepEqual(cameraCheckThresholdGroups(records).map(x=>({threshold:x.threshold,total:x.total,missed:x.missed})),[{threshold:.4,total:1,missed:0},{threshold:.75,total:1,missed:1}]);
});
test('legacy standard samples can still be grouped and cannot mislabel a mixed export',()=>{
  const f=fixture();f.check.begin('laptop',true,f.context);f.frame();const {threshold,...legacy}=f.check.getSnapshot().records[0];assert.equal(threshold,.55);
  assert.equal(cameraCheckThresholdGroups([legacy])[0].threshold,.55);const exported=cameraCheckExport([legacy]);assert.equal(exported.samples[0].threshold,.55);assert.equal(Object.hasOwn(exported,'threshold'),false);
});

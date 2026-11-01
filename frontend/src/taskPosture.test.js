import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskPosturePolicy,rotationDistance,rotationFromMatrix} from './taskPosture.js';
const rotation=degrees=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[c,0,s,0,1,0,-s,0,c];};
function calibrated(options={}){const p=createTaskPosturePolicy(options);p.calibrate('screen',0);for(let t=0;t<=2500;t+=500)p.observe(rotation(0),1,t);return p;}
test('matrix validation and rotation angle',()=>{
  assert.equal(rotationFromMatrix({data:Array(16).fill(0)}),null);
  assert.equal(rotationFromMatrix({data:Array(16).fill(NaN)}),null);
  assert.equal(rotationFromMatrix(null),null);
  assert.deepEqual(rotationFromMatrix({data:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}),[1,0,0,0,1,0,0,0,1]);
  assert.ok(Math.abs(rotationDistance(rotation(0),rotation(40))-40)<.001);
});
test('calibration requires six stable samples; second book pose is accepted',()=>{
  const p=calibrated();assert.equal(p.observe(rotation(0),1,3000).state,'aligned');
  p.calibrate('book',3000);for(let t=3000;t<=5500;t+=500)p.observe(rotation(40),1,t);
  const v=p.observe(rotation(40),1,6000);assert.equal(v.state,'aligned');assert.deepEqual(v.zones,['screen','book']);
});
test('moving during calibration resets samples and times out without overwriting',()=>{
  const p=calibrated();p.calibrate('screen',3000);
  assert.equal(p.observe(rotation(0),1,3000).samples,1);
  assert.equal(p.observe(rotation(40),1,3500).samples,1);
  for(let t=4000;t<15500;t+=500)p.observe(rotation(t%1000?40:0),1,t);
  assert.equal(p.observe(rotation(0),1,15500).state,'calibration-failed');
  assert.equal(p.observe(rotation(0),1,16000).state,'aligned');
});
test('sustained deviation, hysteresis, cooldown and correction',()=>{
  const p=calibrated({absentMs:2000,cooldownMs:6000});
  for(let t=3000;t<5000;t+=500)assert.equal(p.observe(rotation(40),1,t).remind,false);
  assert.equal(p.observe(rotation(40),1,5000).remind,true);
  assert.equal(p.observe(rotation(22),1,5500).state,'deviating');
  assert.equal(p.observe(rotation(10),1,6000).state,'aligned');
  p.correct(6500);for(let t=6500;t<=12000;t+=500)assert.equal(p.observe(rotation(40),1,t).remind,false);
  assert.equal(p.observe(rotation(40),1,12500).remind,true);
});
test('absent, multiple people, stale samples and invalid rotation never count deviation',()=>{
  for(const [r,count,t] of [[null,0,3500],[rotation(40),2,3500],[rotation(40),1,9000],[rotation(40),1,1000]]){
    const p=calibrated({absentMs:1000});p.observe(rotation(40),1,3000);
    assert.equal(p.observe(r,count,t).state,'unknown');
    assert.equal(p.observe(rotation(40),1,t+500).remind,false);
  }
});
test('a new session has no calibration and reset clears in-progress timing',()=>{
  const p=createTaskPosturePolicy();assert.equal(p.observe(rotation(0),1,0).state,'uncalibrated');
  const q=calibrated({absentMs:1000});q.observe(rotation(40),1,3000);q.reset();assert.equal(q.observe(rotation(40),1,6000).remind,false);
});
test('changing tolerance and delay retains calibration, restarts timing and preserves cooldown',()=>{
  const p=calibrated({absentMs:1000,cooldownMs:6000});
  p.observe(rotation(30),1,3000);assert.equal(p.observe(rotation(30),1,4000).remind,true);
  p.configure({profile:'relaxed',absentMs:2000});
  const normal=p.observe(rotation(30),1,4500);assert.equal(normal.state,'aligned');assert.deepEqual(normal.zones,['screen']);
  p.configure({profile:'sensitive',absentMs:1000});
  assert.equal(p.observe(rotation(20),1,5000).state,'deviating');
  for(let t=5500;t<10000;t+=500)assert.equal(p.observe(rotation(20),1,t).remind,false);
  assert.equal(p.observe(rotation(20),1,10000).remind,true);
});
test('settings changes do not allow old pending time to fire immediately',()=>{
  const p=calibrated({absentMs:3000});p.observe(rotation(40),1,3000);p.observe(rotation(40),1,5500);
  p.configure({absentMs:1000});assert.equal(p.observe(rotation(40),1,6000).remind,false);
  assert.equal(p.observe(rotation(40),1,7000).remind,true);
});
test('removing one bad calibration preserves the other; removing both requires calibration',()=>{
  const p=calibrated();p.calibrate('book',3000);for(let t=3000;t<=5500;t+=500)p.observe(rotation(40),1,t);
  assert.deepEqual(p.remove('book'),['screen']);assert.equal(p.observe(rotation(0),1,6000).state,'aligned');
  assert.equal(p.observe(rotation(40),1,6500).state,'deviating');
  assert.deepEqual(p.remove('screen'),[]);assert.equal(p.observe(rotation(0),1,7000).state,'uncalibrated');
});
test('a frame captured before calibration was requested cannot be a calibration sample',()=>{
  const p=createTaskPosturePolicy();p.calibrate('screen',1000);
  assert.equal(p.observe(rotation(40),1,900).samples,0);
  assert.equal(p.observe(null,0,950).state,'calibrating');
  for(let t=1000;t<=3500;t+=500)p.observe(rotation(0),1,t);
  assert.equal(p.observe(rotation(0),1,4000).state,'aligned');
});

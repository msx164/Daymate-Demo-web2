import test from 'node:test';import assert from 'node:assert/strict';
import {objectEvidence,createObjectObservationPolicy,OBJECT_SCORE_PROFILES,objectThreshold} from './objectObservation.js';
const phone=[{label:'cell phone',score:.9}],book=[{label:'book',score:.8}];
test('only supported, above-threshold objects are retained once per label',()=>{
  assert.deepEqual(objectEvidence([...phone,{label:'cell phone',score:.7},{label:'book',score:.54},{label:'cat',score:.99},{label:'laptop',score:NaN},{label:'book',score:2}]),phone);
  assert.equal(objectEvidence(null),null);assert.equal(objectEvidence(Array(11).fill(phone[0])),null);
});
test('objects default to factual evidence without a phone reminder',()=>{
  const p=createObjectObservationPolicy();for(let t=0;t<30000;t+=1000)assert.equal(p.observe(phone,t).remind,false);
  assert.equal(p.observe(book,30000).state,'observing');
});
test('phone inquiry requires continuous evidence, enough samples and explicit opt-in',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true,absentMs:1000});
  assert.equal(p.observe(phone,0).remind,false);assert.equal(p.observe(phone,1000).remind,false);assert.equal(p.observe(phone,2000).remind,true);
  assert.equal(p.observe(phone,3000).remind,false);
});
test('missing phone and sampling gaps restart continuous evidence, not task completion',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true,absentMs:3000});p.observe(phone,0);p.observe(phone,1000);
  assert.equal(p.observe(book,2000).state,'observing');assert.equal(p.observe(phone,3000).seconds,0);
  assert.equal(p.observe(phone,7000).state,'unknown');assert.equal(p.observe(phone,8000).seconds,0);
  assert.equal(p.observe([],9000).remind,false);assert.equal(p.observe(null,10000).state,'unknown');
});
test('user correction and settings changes preserve cooldown; turning inquiry off silences it',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true,absentMs:1000,cooldownMs:6000});
  p.observe(phone,0);p.observe(phone,1000);assert.equal(p.observe(phone,2000).remind,true);p.correct(2500);
  p.configure({phoneReminders:true,absentMs:1000});
  for(let t=3000;t<8500;t+=500)assert.equal(p.observe(phone,t).remind,false);
  assert.equal(p.observe(phone,8500).remind,true);
  p.configure({phoneReminders:false,absentMs:1000});assert.equal(p.observe(phone,9000).state,'observing');
});
test('weak phone scores, backward or duplicate timestamps cannot accumulate evidence',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true});p.observe(phone,1000);
  assert.equal(p.observe(phone,1000).state,'unknown');assert.equal(p.observe(phone,900).state,'unknown');
  assert.deepEqual(p.observe([{label:'cell phone',score:.3}],2000).objects,[]);
});
test('profile thresholds include their boundary and invalid settings preserve the safe default',()=>{
  for(const {threshold} of Object.values(OBJECT_SCORE_PROFILES)){
    assert.equal(objectEvidence([{label:'book',score:threshold}],threshold).length,1);
    assert.equal(objectEvidence([{label:'book',score:threshold-.0001}],threshold).length,0);
  }
  for(const value of [0,1,NaN,'sensitive',null])assert.equal(objectThreshold(value),.55);
  assert.equal(objectEvidence([{label:'cell phone',score:.5}]).length,0);
});
test('sensitivity changes affect phone evidence and preserve an existing reminder cooldown',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true,absentMs:1000,cooldownMs:10000}),weak=[{label:'cell phone',score:.5}];
  assert.equal(p.observe(weak,0).state,'observing');
  p.configure({phoneReminders:true,threshold:.4});p.observe(weak,1000);p.observe(weak,2000);assert.equal(p.observe(weak,3000).remind,true);
  p.configure({phoneReminders:true,threshold:.75});assert.equal(p.observe(weak,4000).state,'observing');
  for(let t=5000;t<13000;t+=1000)assert.equal(p.observe(phone,t).remind,false);
  assert.equal(p.observe(phone,13000).remind,true);
});
test('changing the threshold resets pending phone duration rather than firing on old evidence',()=>{
  const p=createObjectObservationPolicy({phoneReminders:true,absentMs:3000});p.observe(phone,0);p.observe(phone,1000);p.observe(phone,2000);
  p.configure({phoneReminders:true,threshold:.4});assert.equal(p.observe(phone,3000).seconds,0);assert.equal(p.observe(phone,4000).remind,false);p.observe(phone,5000);assert.equal(p.observe(phone,6000).remind,true);
});

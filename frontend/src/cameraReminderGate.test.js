import test from 'node:test';import assert from 'node:assert/strict';
import {createCameraReminderGate} from './cameraReminderGate.js';
test('different observations share the same two-minute minimum interval',()=>{
  let now=0;const gate=createCameraReminderGate({clock:()=>now}),a={},b={},c={};
  assert.equal(gate.request(a,'presence'),1);assert.equal(gate.request(b,'posture'),null);assert.equal(gate.request(c,'objects'),null);
  now=119999;assert.equal(gate.request(b,'posture'),null);
  now=120000;assert.equal(gate.request(b,'posture'),2);assert.equal(gate.getSnapshot().active.owner,b);
});
test('correction snoozes all observations and rejects duplicate or stale actions',()=>{
  let now=0;const gate=createCameraReminderGate({clock:()=>now}),a={},b={};
  const ticket=gate.request(a,'objects');assert.equal(gate.correct(b,ticket),false);
  now=5000;assert.equal(gate.correct(a,ticket),true);assert.equal(gate.correct(a,ticket),false);assert.equal(gate.getSnapshot().active,null);
  now=124999;assert.equal(gate.request(b,'presence'),null);now=125000;assert.equal(gate.request(b,'presence'),2);
  assert.equal(gate.correct(a,ticket),false);assert.equal(gate.getSnapshot().active.owner,b);
});
test('dismissal, settings changes and replacement cannot bypass cooldown or replay denied requests',()=>{
  let now=0;const gate=createCameraReminderGate({clock:()=>now}),old={},fresh={};
  gate.request(old,'posture');gate.dismiss(fresh);assert.equal(gate.getSnapshot().active.owner,old);
  gate.dismiss(old);assert.equal(gate.getSnapshot().active,null);assert.equal(gate.request(fresh,'posture'),null);
  now=120000;assert.equal(gate.getSnapshot().active,null);assert.equal(gate.request(fresh,'posture'),2);
  gate.dismiss(old);assert.equal(gate.getSnapshot().active.owner,fresh);
});
test('manual snooze clears visible inquiries but needs no active inquiry',()=>{
  let now=0;const gate=createCameraReminderGate({clock:()=>now}),owner={};
  assert.equal(gate.snooze(),true);now=1000;assert.equal(gate.request(owner,'objects'),null);
  now=120000;gate.request(owner,'objects');assert.ok(gate.getSnapshot().active);
  now=121000;gate.snooze();assert.equal(gate.getSnapshot().active,null);assert.equal(gate.getSnapshot().snoozed,true);
});
test('invalid or backward clocks cannot shorten the interval',()=>{
  let now=1000;const gate=createCameraReminderGate({clock:()=>now}),owner={};gate.request(owner,'presence');
  now=NaN;assert.equal(gate.snooze(),false);assert.equal(gate.request(owner,'posture'),null);
  now=0;gate.snooze();now=120999;assert.equal(gate.request(owner,'posture'),null);
  now=121000;assert.equal(gate.request(owner,'posture'),2);
});
test('external-store snapshots are stable until a change, and subscriptions unsubscribe',()=>{
  const gate=createCameraReminderGate({clock:()=>0}),initial=gate.getSnapshot();let events=0;
  assert.equal(gate.getSnapshot(),initial);const stop=gate.subscribe(()=>events++);
  gate.request({},'presence');assert.equal(events,1);assert.notEqual(gate.getSnapshot(),initial);
  gate.request({},'posture');assert.equal(events,1);stop();gate.snooze();assert.equal(events,1);
});

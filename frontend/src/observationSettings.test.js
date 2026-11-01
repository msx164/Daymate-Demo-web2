import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observationSettings} from './observationSettings.js';
import {createPresencePolicy} from './presenceObserver.js';

test('moving and resting scenes display presence without absence reminders',()=>{
  for(const activity of ['cleaning','dishes','stretching','resting']){
    const settings=observationSettings(activity),policy=createPresencePolicy(settings);
    assert.equal(settings.profile,'mobile');
    for(let now=0;now<=180000;now+=1000)assert.equal(policy.observe(0,now).remind,false);
    assert.equal(policy.observe(1,181000).state,'present');
  }
});
test('desk scenes and manual overrides keep chosen delay with safe fallback',()=>{
  for(const activity of ['reading','working','idle'])assert.equal(observationSettings(activity).reminders,true);
  assert.equal(observationSettings('cleaning','desk',60).absentMs,60000);
  assert.equal(observationSettings('reading','mobile').reminders,false);
  assert.deepEqual(observationSettings(null,'invalid',NaN),observationSettings('idle'));
});
test('custom threshold waits fully and reset starts a fresh interval',()=>{
  const policy=createPresencePolicy(observationSettings('working','auto',30));
  for(let now=0;now<30000;now+=250)assert.equal(policy.observe(0,now).remind,false);
  assert.equal(policy.observe(0,30000).remind,true);
  policy.reset();
  for(let now=200000;now<230000;now+=250)assert.equal(policy.observe(0,now).remind,false);
  assert.equal(policy.observe(0,230000).remind,true);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {createPresencePolicy} from './presenceObserver.js';
test('absence is sustained evidence and reminder has a cooldown',()=>{
  const policy=createPresencePolicy();let result;
  for(let t=0;t<=15000;t+=250)result=policy.observe(0,t);
  assert.equal(result.remind,true);assert.equal(policy.observe(0,15250).remind,false);
  assert.equal(policy.observe(1,15500).state,'present');assert.equal(policy.observe(2,15750).state,'multiple');
});
test('gaps, camera resets and corrections never turn unavailable into absence',()=>{
  const policy=createPresencePolicy();policy.observe(0,0);assert.equal(policy.observe(0,16000).state,'unknown');
  policy.reset();policy.correct(20000);let reminded=false;
  for(let t=20000;t<=50000;t+=250)reminded ||=policy.observe(0,t).remind;
  assert.equal(reminded,false);assert.equal(policy.observe(NaN,50250).state,'unknown');
});

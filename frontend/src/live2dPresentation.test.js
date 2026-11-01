import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationMotion} from './live2dPresentation.js';
import {activityRhythm} from './activityRhythm.js';
const frame=(now,activity='reading',animated=true)=>({now,activity,animated,state:'idle'});
test('scene transition eases from the visible pose rather than jumping to a new target',()=>{
  const motion=createPresentationMotion();const first=motion.sample(frame(0));
  const switched=motion.sample(frame(33,'stretching'));
  assert.ok(switched.parameters.ParamAngleY>first.parameters.ParamAngleY);
  assert.ok(switched.parameters.ParamAngleY<0);
  let result;for(let i=2;i<50;i++)result=motion.sample(frame(i*33,'stretching'));
  assert.ok(result.parameters.ParamAngleY>4.9);
  assert.ok(Math.abs(result.parameters.ParamArmLA)<1);
});
test('paused motion holds pose and clock; resume does not include a hidden gap',()=>{
  const motion=createPresentationMotion();motion.sample(frame(0));const moving=motion.sample(frame(33));
  motion.resetClock();const paused=motion.sample(frame(20000,'reading',false));
  assert.deepEqual(paused,moving);
  assert.deepEqual(motion.sample(frame(40000,'reading',false)),moving);
  motion.resetClock();assert.deepEqual(motion.sample(frame(50000)),moving);
  assert.ok(motion.sample(frame(50033)).seconds-moving.seconds<.04);
});
test('returning from a native motion blends from its last authored values',()=>{
  const motion=createPresentationMotion();motion.sample(frame(0));motion.adopt({ParamAngleX:20});
  const sample=motion.sample(frame(33));assert.ok(sample.parameters.ParamAngleX>10&&sample.parameters.ParamAngleX<20);
});
test('model-specific native channels cannot remain latched in the procedural pose after stop',()=>{
  const motion=createPresentationMotion();motion.sample(frame(0));
  motion.adopt({ParamDayPage:.4,ParamDayReach:1,ParamAngleX:20});
  for(const animated of [true,false]){
    const value=motion.sample(frame(33,'reading',animated));
    assert.equal(Object.hasOwn(value.parameters,'ParamDayPage'),false);
    assert.equal(Object.hasOwn(value.parameters,'ParamDayReach'),false);
    assert.ok(value.parameters.ParamAngleX>0);
  }
});
test('shared activity rhythm includes reading pauses, sparse page turns and typing breaks',()=>{
  assert.equal(activityRhythm(2,true).turn,0);assert.ok(activityRhythm(11.8,true).turn>.9);
  assert.equal(activityRhythm(13,true).turn,0);
  assert.equal(activityRhythm(6,true).typing,0);assert.ok(activityRhythm(1,true).typing>.9);
  assert.equal(activityRhythm(4.25,true).blink,1);
  assert.deepEqual(activityRhythm(0,false),activityRhythm(999,false));
});

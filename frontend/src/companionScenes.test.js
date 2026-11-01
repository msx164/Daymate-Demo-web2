import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveScene} from './companionScenes.js';
import {readAppearance,writeAppearance} from './companionAppearance.js';
test('auto rooms follow activity and explicit rooms override without discarding legacy preferences',()=>{
  for(const [activity,room] of [['reading','day'],['working','day'],['dishes','kitchen'],['cleaning','lounge'],['stretching','lounge'],['resting','lounge']])assert.equal(resolveScene('auto',activity),room);
  assert.equal(resolveScene('night','dishes'),'night');assert.equal(resolveScene('__proto__','dishes'),'day');
  let raw;const storage={getItem:()=>raw,setItem:(_k,value)=>{raw=value;}};
  for(const scene of ['day','night','kitchen','lounge','auto']){
    assert.equal(writeAppearance(storage,{scene,character:'day',motion:true,activity:'auto'}),'');
    assert.equal(readAppearance(storage).settings.scene,scene);
  }
});

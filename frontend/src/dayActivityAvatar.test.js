import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayActivityResource} from './dayActivityAvatar.js';
test('original Day gets his task pose during idle, focus and pause without replacing reply states',()=>{
  const images={reading:'read.png',working:'work.png',cleaning:'clean.png',dishes:'wash.png'};
  for(const state of ['idle','focus','paused','saving'])for(const activity of Object.keys(images)){
    const r=dayActivityResource({character:'day',state,activity,images});assert.equal(r.src,images[activity]);assert.equal(r.name,'Day');
  }
  for(const state of ['speaking','thinking','ended'])assert.equal(dayActivityResource({character:'day',state,activity:'reading',images}),null);
  for(const character of ['custom','robot'])assert.equal(dayActivityResource({character,state:'idle',activity:'reading',images}),null);
  assert.equal(dayActivityResource({character:'day',state:'idle',activity:'reading',images,failed:['read.png']}),null);
  assert.equal(dayActivityResource({character:'day',state:'idle',activity:'__proto__',images}),null);
});

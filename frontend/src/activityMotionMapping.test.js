import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityMotionMapping } from './activityMotionMapping.js';
const base = { ready: true, enabled: true, activity: 'reading', bindings: { reading: '0', working: '1' }, clips: [{id:'0'}, {id:'1'}] };
test('scene changes play once, unbound scenes stop, unrelated changes do not replay', () => {
  const map = createActivityMotionMapping();
  assert.deepEqual(map.update(base), {action:'play',id:'0'});
  assert.equal(map.update({...base,bindings:{...base.bindings,dishes:'1'}}),null);
  assert.deepEqual(map.update({...base,activity:'working'}),{action:'play',id:'1'});
  assert.deepEqual(map.update({...base,activity:'dishes'}),{action:'stop'});
  assert.equal(map.update({...base,activity:'dishes'}),null);
});
test('opt in and disable, reload resets, missing or undeclared IDs cannot play', () => {
  const map=createActivityMotionMapping();
  assert.equal(map.update({...base,enabled:false}),null);
  assert.deepEqual(map.update(base),{action:'play',id:'0'});
  assert.deepEqual(map.update({...base,enabled:false}),{action:'stop'});
  assert.equal(map.update({...base,ready:false}),null);
  assert.deepEqual(map.update(base),{action:'play',id:'0'});
  assert.deepEqual(map.update({...base,bindings:{reading:'https://example.test/motion'}}),{action:'stop'});
  assert.deepEqual(map.update({...base,bindings:{reading:0}}),null);
});

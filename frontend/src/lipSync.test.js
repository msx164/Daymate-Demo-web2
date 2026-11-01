import {test} from 'node:test';import assert from 'node:assert/strict';import {visemeShape} from './lipSync.js';
test('visemes distinguish silence, closure, rounded and open vowels',()=>{
  assert.equal(visemeShape(0).open,0);assert.equal(visemeShape(21).open,0);assert.equal(visemeShape(999).open,0);
  assert.ok(visemeShape(8).width<visemeShape(2).width);assert.ok(visemeShape(2).open>visemeShape(19).open);
});

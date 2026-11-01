import test from 'node:test';
import assert from 'node:assert/strict';
import { animatedState, stateParameters, live2dState } from './live2dState.js';
import { trackGLResources } from './live2dGLResources.js';
test('preview state validation and motion rules respect pauses, saving and reduced motion', () => {
  assert.equal(live2dState('<script>'), 'idle');
  for (const state of ['paused', 'saving']) assert.equal(animatedState(state, true, false), false);
  assert.equal(animatedState('idle', true, true), false);
  assert.equal(animatedState('idle', false, false), false);
  assert.equal(animatedState('thinking', true, false), true);
});
test('disabled motion yields fixed parameters while speaking remains an explicit simulation', () => {
  assert.deepEqual(stateParameters('speaking', 0, false), stateParameters('speaking', 100, false));
  assert.equal(stateParameters('idle', 1, true).ParamMouthOpenY, 0);
  assert.ok(stateParameters('speaking', 1, true).ParamMouthOpenY > 0);
  assert.ok(stateParameters('focus', 0, false).ParamAngleY < 0);
});
test('dedicated GL handle tracker deletes remaining handles once and blocks late allocations', () => {
  const gl = {}, removed = [];
  for (const type of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader']) {
    gl['create' + type] = () => ({ type }); gl['delete' + type] = handle => removed.push(handle);
  }
  const tracker = trackGLResources(gl), texture = gl.createTexture(); gl.createBuffer();
  assert.equal(tracker.snapshot().Texture, 1);
  gl.deleteTexture(texture); assert.equal(tracker.snapshot().Texture, 0);
  assert.ok(Object.values(tracker.release()).every(value => value === 0));
  assert.equal(removed.length, 2); tracker.release(); assert.equal(removed.length, 2);
  assert.equal(gl.createTexture(), null);
});

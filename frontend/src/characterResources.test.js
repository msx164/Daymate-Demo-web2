import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarResource, characterSnapshot } from './characterResources.js';
import { validAppearance, readAppearance, writeAppearance } from './companionAppearance.js';
const id = 'a'.repeat(32);
const custom = { id, name: 'My role', poses: { default: `/characters/${id}/default.png`, focused: `/characters/${id}/focused.png` } };
const images = { default: '/builtin.png', focused: '/focus.png', speaking: '/talk.png' };
test('renderer only accepts bounded character metadata and exact local asset paths', () => {
  assert.deepEqual(characterSnapshot({ character: custom }).character, custom);
  assert.equal(characterSnapshot({ character: null, error: 'missing' }).error, 'missing');
  for (const value of [{ ...custom, id: '../bad' }, { ...custom, name: '' }, { ...custom, poses: { default: 'https://external/a.png' } },
    { ...custom, poses: { default: custom.poses.default, script: 'run.js' } }]) assert.throws(() => characterSnapshot({ character: value }));
});
test('custom pose fallback uses own default then built-in then robot; new imports recover automatically', () => {
  const resolve = (pose, failed = [], role = custom) => avatarResource({ character: 'custom', pose, failed, custom: role, images });
  assert.equal(resolve('focused').src, custom.poses.focused);
  assert.equal(resolve('speaking').src, custom.poses.default);
  assert.equal(resolve('focused', [custom.poses.focused]).src, custom.poses.default);
  assert.equal(resolve('focused', Object.values(custom.poses)).src, images.default);
  assert.equal(resolve('focused', [...Object.values(custom.poses), images.default]).pose, 'robot');
  assert.equal(resolve('focused', [], null).src, images.default);
  assert.equal(resolve('focused', [custom.poses.focused], { ...custom, poses: { default: '/new.png', focused: '/new-focus.png' } }).src, '/new-focus.png');
  assert.equal(avatarResource({ character: 'robot', pose: 'focused', images }).pose, 'robot');
});
test('custom choice persists with the existing preference format and old choices still work', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  for (const character of ['custom', 'day', 'robot']) {
    const settings = { scene: 'day', motion: false, character, activity: 'idle' };
    assert.equal(validAppearance(settings), true);
    assert.equal(writeAppearance(storage, settings), '');
    assert.deepEqual(readAppearance(storage).settings, settings);
  }
});

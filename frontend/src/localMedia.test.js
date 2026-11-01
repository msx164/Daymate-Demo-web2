import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMedia } from './localMedia.js';
function stream() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; }, onended: null };
  return { track, getTracks: () => [track] };
}
test('devices start independently, stop releases tracks and grants', async () => {
  const camera = stream(), microphone = stream(), permissions = [];
  const media = createLocalMedia({ capture: async c => c.video ? camera : microphone, authorize: async (...args) => permissions.push(args) });
  await media.start('video'); await media.start('audio');
  media.stop('video');
  assert.equal(camera.track.readyState, 'ended'); assert.equal(microphone.track.readyState, 'live');
  assert.equal(media.getSnapshot().video.stream, null);
  media.stopAll(); assert.equal(microphone.track.readyState, 'ended');
  assert.deepEqual(permissions.slice(0, 3), [['video', true], ['audio', true], ['video', false]]);
});
test('hangup before capture resolves stops late tracks without reviving preview', async () => {
  let resolve;
  const captured = stream();
  const media = createLocalMedia({ capture: () => new Promise(r => { resolve = r; }) });
  const pending = media.start('video'); await Promise.resolve();
  media.stopAll(); resolve(captured); await pending;
  assert.equal(captured.track.readyState, 'ended'); assert.equal(media.getSnapshot().video.status, 'off');
});
test('cancelling authorization prevents capture; restart remains possible', async () => {
  let resolve, captures = 0;
  const media = createLocalMedia({ authorize: (_kind, enabled) => enabled ? new Promise(r => { resolve = r; }) : Promise.resolve(), capture: async () => { captures++; return stream(); } });
  const first = media.start('audio'); media.stopAll(); resolve(); await first;
  assert.equal(captures, 0);
  const second = media.start('audio'); resolve(); await second;
  assert.equal(media.getSnapshot().audio.status, 'on'); media.stopAll();
});
test('denial can be retried; disconnected device closes and reports unavailable', async () => {
  let fail = true; const captured = stream();
  const media = createLocalMedia({ capture: async () => { if (fail) throw { name: 'NotAllowedError' }; return captured; } });
  await media.start('video'); assert.match(media.getSnapshot().video.error, /授权被拒绝/);
  fail = false; await media.start('video'); captured.track.onended();
  assert.equal(media.getSnapshot().video.stream, null); assert.match(media.getSnapshot().video.error, /断开/);
});
test('late old capture cannot replace a newly started stream', async () => {
  const resolves = [], old = stream(), current = stream();
  const media = createLocalMedia({ capture: () => new Promise(resolve => resolves.push(resolve)) });
  const first = media.start('video'); await Promise.resolve(); media.stop('video');
  const second = media.start('video'); await Promise.resolve();
  resolves[1](current); await second; resolves[0](old); await first;
  assert.equal(old.track.readyState, 'ended'); assert.equal(media.getSnapshot().video.stream, current);
  media.stopAll();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasSize, createFrameStats, createFrameGate, modelFitHeight } from './live2dPerformance.js';

test('model fits both axes in tall pet and wide scene viewports without cropping', () => {
  for (const [width, height] of [[220, 240], [180, 400], [600, 180]]) {
    const modelWidth = 2, modelHeight = 4;
    const fitted = modelFitHeight(width, height, modelWidth, modelHeight);
    assert.ok(fitted <= 1.85);
    assert.ok(fitted * modelWidth / modelHeight * height / width <= 1.85 + 1e-10);
  }
});

test('30 FPS gate bounds rendering on a 144 Hz display and resumes immediately after reset', () => {
  const gate = createFrameGate(); let frames = 0;
  for (let i = 0; i < 1440; i++) if (gate.due(i * 1000 / 144)) frames++;
  assert.ok(frames >= 299 && frames <= 301, String(frames));
  gate.reset(); assert.equal(gate.due(10001), true);
});
test('canvas pixel budget preserves aspect ratio for wide and tall layouts', () => {
  assert.deepEqual(canvasSize(1200, 400, 2), { width: 1600, height: 533 });
  assert.deepEqual(canvasSize(400, 1200, 2), { width: 533, height: 1600 });
  assert.deepEqual(canvasSize(240, 370, 1.5), { width: 360, height: 555 });
  assert.deepEqual(canvasSize(0, NaN, -1), { width: 1, height: 1 });
});
test('frame statistics remain bounded and snapshots do not mutate samples', () => {
  const stats = createFrameStats(3);
  for (const time of [0, 10, 30, 60, 100]) stats.record(time, 2);
  const result = stats.snapshot();
  assert.equal(result.intervals.samples, 3); assert.equal(result.intervals.medianMs, 30); assert.equal(result.intervals.p95Ms, 40);
  result.intervals.medianMs = 99; assert.equal(stats.snapshot().intervals.medianMs, 30);
});
test('pauses reset the interval clock and invalid durations are ignored', () => {
  const stats = createFrameStats(); stats.record(0, 2); stats.resetGap(); stats.record(100000, 2); stats.record(100016, 3);
  stats.record(NaN, 1); stats.record(100017, -2);
  assert.equal(stats.snapshot().intervals.samples, 1); assert.equal(stats.snapshot().intervals.p95Ms, 16);
  assert.equal(stats.snapshot().draws.samples, 3);
});

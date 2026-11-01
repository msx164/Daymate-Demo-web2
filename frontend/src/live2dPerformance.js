export function modelFitHeight(viewWidth, viewHeight, modelWidth, modelHeight) {
  return 1.85 * Math.min(1, (viewWidth / viewHeight) / (modelWidth / modelHeight));
}
export function createFrameGate(fps = 30) {
  const interval = 1000 / fps;
  let previous = null;
  return {
    reset() { previous = null; },
    due(now) {
      if (previous === null) { previous = now; return true; }
      const elapsed = now - previous;
      if (elapsed + .01 < interval) return false;
      previous += Math.max(1, Math.floor((elapsed + .01) / interval)) * interval;
      return true;
    },
  };
}
export function canvasSize(width, height, dpr = 1) {
  width = Number.isFinite(width) && width > 0 ? width : 1;
  height = Number.isFinite(height) && height > 0 ? height : 1;
  const scale = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, 2, 1600 / width, 1600 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function createFrameStats(capacity = 600) {
  const maximum = Number.isInteger(capacity) && capacity >= 1 && capacity <= 3600 ? capacity : 600;
  const intervals = [], draws = [];
  let previous = null;
  const push = (values, value) => { values.push(value); if (values.length > maximum) values.shift(); };
  const summarize = values => {
    if (!values.length) return { samples: 0, medianMs: null, p95Ms: null };
    const sorted = [...values].sort((a, b) => a - b);
    return { samples: sorted.length, medianMs: sorted[Math.floor((sorted.length - 1) * .5)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
  };
  return {
    resetGap() { previous = null; },
    record(now, duration) {
      if (!Number.isFinite(now) || !Number.isFinite(duration) || duration < 0) return;
      if (previous !== null && now > previous) push(intervals, now - previous);
      previous = now; push(draws, duration);
    },
    snapshot: () => ({ intervals: summarize(intervals), draws: summarize(draws) }),
  };
}

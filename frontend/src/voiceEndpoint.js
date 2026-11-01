import { voiceTiming } from './voiceTiming.js';
export const VOICE_THRESHOLDS = { sensitive: 0.008, normal: 0.015, conservative: 0.035 };
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) { const value = Number.isFinite(sample) ? sample : 0; sum += value * value; }
  return Math.sqrt(sum / samples.length);
}

// Volume-based endpointing, not a speech/content classifier. All durations are monotonic.
export function createPauseDetector({ threshold = VOICE_THRESHOLDS.normal, silenceMs = 1400, waitMs = 8000 } = {}) {
  let first = null, previous = null, voiced = 0, lastLoud = null, heard = false, done = false;
  return (level, time) => {
    if (done) return { state: 'done' };
    if (!Number.isFinite(time) || (previous !== null && (time < previous || time - previous > 1000))) {
      done = true; return { state: 'interrupted' };
    }
    if (first === null) first = time;
    const delta = previous === null ? 0 : Math.min(250, time - previous); previous = time;
    const loud = Number.isFinite(level) && level >= threshold;
    if (loud) { voiced += delta; lastLoud = time; if (voiced >= 300) heard = true; }
    else if (!heard && (lastLoud === null || time - lastLoud > 120)) voiced = 0;
    if (heard && !loud && time - lastLoud >= silenceMs) { done = true; return { state: 'end' }; }
    if (!heard && time - first >= waitMs) { done = true; return { state: 'empty' }; }
    return { state: heard ? loud ? 'sound' : 'pause' : 'waiting' };
  };
}

export function watchVoicePause(stream, { sensitivity = 'normal', timing = 'normal', onState, onEnd, onEmpty, onError }, {
  createContext = () => new AudioContext(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
} = {}) {
  const context = createContext();
  let source, analyser, frame = null, stopped = false, lastRead = -Infinity, lastUpdate = -Infinity;
  function stop() {
    if (stopped) return; stopped = true;
    if (frame !== null) cancelFrame(frame);
    source?.disconnect(); analyser?.disconnect();
    void context.close().catch(() => {});
  }
  try {
    source = context.createMediaStreamSource(stream); analyser = context.createAnalyser(); analyser.fftSize = 2048;
    source.connect(analyser); // No connection to speakers; the caller owns the microphone tracks.
    const samples = new Float32Array(analyser.fftSize);
    const detect = createPauseDetector({ threshold: VOICE_THRESHOLDS[sensitivity] ?? VOICE_THRESHOLDS.normal, silenceMs: voiceTiming(timing).silenceMs });
    function sample(time) {
      if (stopped) return;
      try {
        if (time - lastRead >= 50) {
          lastRead = time; analyser.getFloatTimeDomainData(samples);
          const level = rms(samples), result = detect(level, time);
          if (['end', 'empty', 'interrupted'].includes(result.state)) {
            stop();
            if (result.state === 'end') onEnd(); else if (result.state === 'empty') onEmpty(); else onError('采集检测中断，请重新开始。');
            return;
          }
          if (time - lastUpdate >= 150) { lastUpdate = time; onState({ ...result, level: Math.min(1, level * 8) }); }
        }
        frame = requestFrame(sample);
      } catch { stop(); onError('停顿检测不可用，可点击“结束并识别”。'); }
    }
    void context.resume().then(() => { if (!stopped) frame = requestFrame(sample); }).catch(() => {
      if (!stopped) { stop(); onError('停顿检测未能启动，可点击“结束并识别”。'); }
    });
  } catch { stop(); throw Error('停顿检测不可用，可点击“结束并识别”。'); }
  return { stop };
}

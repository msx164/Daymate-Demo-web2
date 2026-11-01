const KEY = 'daymate.voiceTiming.v1';
export const VOICE_TIMINGS = {
  fast: { label: '快速', silenceMs: 800, cooldownMs: 250 },
  normal: { label: '标准', silenceMs: 1400, cooldownMs: 600 },
  relaxed: { label: '从容', silenceMs: 2000, cooldownMs: 900 },
};
export const voiceTiming = value => Object.hasOwn(VOICE_TIMINGS,value) ? VOICE_TIMINGS[value] : VOICE_TIMINGS.normal;
export function readVoiceTiming(storage) {
  try { const value=storage?.getItem(KEY); return Object.hasOwn(VOICE_TIMINGS,value) ? value : 'normal'; } catch { return 'normal'; }
}
export function saveVoiceTiming(storage,value) {
  if(!Object.hasOwn(VOICE_TIMINGS,value))return false;
  try { storage.setItem(KEY,value);return true; } catch { return false; }
}

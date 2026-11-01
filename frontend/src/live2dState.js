import { activityParameters } from './companionActivities.js';
import { activityRhythm } from './activityRhythm.js';
export const LIVE2D_STATES = ['idle', 'focus', 'paused', 'ended', 'saving', 'thinking', 'speaking'];
export function live2dState(value) { return LIVE2D_STATES.includes(value) ? value : 'idle'; }
export function animatedState(state, enabled, reduced) {
  return enabled === true && !reduced && !['paused', 'saving'].includes(live2dState(state));
}
// Small parameter gestures, not speech-driven lip synchronization.
export function stateParameters(state, seconds, animated, activity = 'idle') {
  state = live2dState(state);
  const wave = animated ? Math.sin(seconds * 1.8) : 0;
  const parameters = {
    ParamAngleZ:0,ParamBodyAngleZ:0,ParamEyeBallX:0,ParamEyeBallY:0,
    ParamArmLA:0,ParamArmRA:0,ParamHandAngleL:0,ParamHandAngleR:0,
    ParamEyeLOpen:1,ParamEyeROpen:1,
    ParamAngleX: state === 'thinking' ? -8 + wave : state === 'focus' ? -3 : wave * 2,
    ParamAngleY: state === 'focus' ? -6 : state === 'ended' ? 4 : 0,
    ParamBodyAngleX: wave * .8,
    ParamBreath: animated ? (Math.sin(seconds * 1.2) + 1) / 2 : .5,
    ParamMouthOpenY: state === 'speaking' && animated ? .15 + Math.abs(wave) * .25 : 0,
  };
  const gesture = activityParameters(activity, seconds, animated);
  // Reply/reading-aloud head gestures keep their existing meaning while the selected body pose remains.
  if (['thinking', 'speaking', 'ended'].includes(state)) for (const key of ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ']) delete gesture[key];
  const result={ ...parameters, ...gesture };
  const open=1-activityRhythm(seconds,animated).blink;
  result.ParamEyeLOpen*=open;result.ParamEyeROpen*=open;
  return result;
}

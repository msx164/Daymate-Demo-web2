import { live2dState } from './live2dState.js';
import { activityId } from './companionActivities.js';
import { propSettings } from './activityProps.js';
import { nativeMotionRequest } from './live2dMotions.js';

// Trusted same-origin runtime only. No conversation, task or bridge data is sent.
export function createPreviewSession({ host, child, onReady, onError, onNativeMotion, timeout = 20000 }) {
  let closed = false, ready = false, current = { state: 'idle', motion: false, reduced: false, activity: 'idle' };
  const send = (action, value) => child.postMessage({ type: 'daymate-preview-control', action, value }, host.location.origin);
  const sync = () => { if (ready && !closed) for (const key of ['state', 'motion', 'reduced', 'activity', 'propSettings']) send(key, current[key]); };
  const fail = () => { if (!closed) { dispose(); onError(); } };
  const receive = event => {
    if (closed || event.source !== child || event.origin !== host.location.origin || event.data?.type !== 'daymate-sdk-preview') return;
    if (event.data.phase === 'ready') { ready = true; host.clearTimeout(timer); sync(); onReady(); }
    if (event.data.phase === 'error') fail();
    if(event.data.phase==='motion' && ['idle','loading','playing','paused','stopped','finished','error'].includes(event.data.motion?.phase))
      onNativeMotion?.({phase:event.data.motion.phase});
  };
  const timer = host.setTimeout(fail, timeout);
  host.addEventListener('message', receive);
  function dispose() {
    if (closed) return;
    closed = true; host.clearTimeout(timer); host.removeEventListener('message', receive);
    // iframe removal alone does not guarantee beforeunload.
    try { child.daymateLive2DPreview?.dispose(); } catch { /* Destruction of the owned iframe is the final boundary. */ }
  }
  return {
    requestMotion(action,id) {
      const request=nativeMotionRequest(action,id);if(closed || !ready || !request)return false;
      child.postMessage({type:'daymate-native-motion',...request},host.location.origin);return true;
    },
    update(value) {
      current = { state: live2dState(value.state), motion: value.motion === true, reduced: value.reduced === true, activity: activityId(value.activity), propSettings:propSettings(value.propSettings) }; sync();
    },
    fail, dispose,
  };
}

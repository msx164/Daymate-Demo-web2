import { activityId } from './companionActivities.js';

// A scene transition issues at most one command. Status/progress updates never replay it.
export function createActivityMotionMapping() {
  let previous = null;
  return {
    update({ ready, enabled, activity, bindings, clips }) {
      if (!ready) { previous = null; return null; }
      const scene = activityId(activity);
      const value = bindings?.[scene];
      const id = typeof value === 'string' && clips.some(clip => clip.id === value) ? value : '';
      const next = { enabled: enabled === true, scene, id };
      const old = previous; previous = next;
      if (!next.enabled) return old?.enabled ? { action: 'stop' } : null;
      if (old?.enabled && old.scene === scene && old.id === id) return null;
      return id ? { action: 'play', id } : { action: 'stop' };
    },
  };
}

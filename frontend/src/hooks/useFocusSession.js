import { userStorage } from '../web2/session.js';
import { useEffect, useState, useSyncExternalStore } from "react";
import { FOCUS_SECONDS } from "../focusClock.js";
import { createFocusController } from "../focusController.js";

function browserStorage() {
  try { return typeof window === "undefined" ? null : userStorage('session'); } catch { return null; }
}

export function useFocusSession() {
  const [controller] = useState(() => createFocusController({
    storage: browserStorage(),
    now: () => performance.timeOrigin + performance.now(),
    newKey: () => crypto.randomUUID(),
  }));
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const timer = setInterval(controller.tick, 200);
    const checkpoint = () => { controller.tick(); controller.checkpoint(); };
    const unsubscribeResume = window.daymateDesktop?.onResume?.(checkpoint);
    window.addEventListener("pagehide", checkpoint);
    document.addEventListener("visibilitychange", checkpoint);
    return () => {
      clearInterval(timer);
      unsubscribeResume?.();
      window.removeEventListener("pagehide", checkpoint);
      document.removeEventListener("visibilitychange", checkpoint);
    };
  }, [controller]);
  return {
    ...view,
    focusTask: view.session?.task ?? null,
    plannedSeconds: view.session?.plannedSeconds ?? FOCUS_SECONDS,
    isFocusing: view.session !== null && view.session.runningSince !== null,
    pendingAction: view.session?.snapshot ? view.session.snapshot.complete_task : null,
    start: controller.start, togglePause: controller.togglePause,
    finish: controller.finish, discard: controller.discard,
  };
}

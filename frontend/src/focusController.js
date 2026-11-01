import { FOCUS_SECONDS, createFocusSession, freezeSession, pauseSession,
  remainingSeconds, resumeSession } from "./focusClock.js";
import { readFocusDraft, writeFocusDraft } from "./focusDraft.js";

export function createFocusController({ storage, now, newKey }) {
  const restored = readFocusDraft(storage);
  let session = restored.session;
  let busy = false;
  let lastCheckpoint = now();
  const listeners = new Set();
  let view = {
    session, timeLeft: remainingSeconds(session, now()), isSaving: false,
    recovered: !!session, storageWarning: restored.warning, saveError: "",
  };
  const emit = (patch = {}) => {
    view = { ...view, session, timeLeft: remainingSeconds(session, now()), ...patch };
    listeners.forEach((listener) => listener());
  };
  const checkpoint = () => {
    lastCheckpoint = now();
    const warning = writeFocusDraft(storage, session, lastCheckpoint);
    if (warning !== view.storageWarning) emit({ storageWarning: warning });
  };
  return {
    getSnapshot: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    checkpoint,
    tick() {
      if (!session) return;
      const remaining = remainingSeconds(session, now());
      if (session.runningSince !== null && remaining === 0) {
        session = pauseSession(session, now());
        emit();
        checkpoint();
      } else if (remaining !== view.timeLeft) emit();
      if (now() - lastCheckpoint >= 1000) checkpoint();
    },
    start(task, plannedSeconds = FOCUS_SECONDS) {
      if (session || busy || task.completed) return false;
      session = createFocusSession(task, now(), newKey(), plannedSeconds);
      emit({ recovered: false, saveError: "" });
      checkpoint();
      return true;
    },
    togglePause() {
      if (!session || session.snapshot || busy) return;
      session = session.runningSince === null ? resumeSession(session, now()) : pauseSession(session, now());
      emit({ recovered: false });
      checkpoint();
    },
    async finish(completeTask, save) {
      if (!session || busy || (session.snapshot && session.snapshot.complete_task !== completeTask)) return null;
      busy = true;
      session = freezeSession(session, now(), completeTask);
      const snapshot = session.snapshot;
      emit({ isSaving: true, saveError: "", recovered: false });
      checkpoint();
      try {
        await save(snapshot);
        session = null;
        emit();
        checkpoint();
        return snapshot;
      } catch (error) {
        emit({ saveError: `保存未确认：${error.message}。请点击同一按钮重试。` });
        throw error;
      } finally {
        busy = false;
        emit({ isSaving: false });
      }
    },
    discard() {
      if (busy) return;
      session = null;
      emit({ recovered: false, saveError: "" });
      checkpoint();
    },
  };
}

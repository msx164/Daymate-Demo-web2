export const FOCUS_SECONDS = 25 * 60;
export const MAX_FOCUS_SECONDS = 240 * 60;

export function elapsedMilliseconds(session, now) {
  if (!session) return 0;
  const running = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince);
  return Math.min(session.plannedSeconds * 1000, session.elapsedMs + running);
}

export function remainingSeconds(session, now) {
  return (session?.plannedSeconds ?? FOCUS_SECONDS) - Math.floor(elapsedMilliseconds(session, now) / 1000);
}

export function createFocusSession(task, now, sessionKey, plannedSeconds = FOCUS_SECONDS) {
  if (!Number.isInteger(plannedSeconds) || plannedSeconds < 60 || plannedSeconds > MAX_FOCUS_SECONDS) {
    throw new RangeError("专注时长必须为 1–240 分钟");
  }
  return { task, startedAt: now, sessionKey, plannedSeconds, elapsedMs: 0, runningSince: now, snapshot: null };
}

export function pauseSession(session, now) {
  return { ...session, elapsedMs: elapsedMilliseconds(session, now), runningSince: null };
}

export function resumeSession(session, now) {
  if (session.snapshot || remainingSeconds(session, now) === 0 || session.runningSince !== null) return session;
  return { ...session, runningSince: now };
}

export function freezeSession(session, now, completeTask) {
  // Preserve both duration and intent across uncertain network outcomes.
  if (session.snapshot) return session;
  const paused = pauseSession(session, now);
  return {
    ...paused,
    snapshot: {
      task_id: session.task.id,
      session_key: session.sessionKey,
      seconds: Math.floor(paused.elapsedMs / 1000),
      planned_seconds: session.plannedSeconds,
      started_at: new Date(session.startedAt).toISOString(),
      ended_at: new Date(Math.max(session.startedAt, now)).toISOString(),
      complete_task: completeTask,
    },
  };
}

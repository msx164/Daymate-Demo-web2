import { MAX_FOCUS_SECONDS, pauseSession } from "./focusClock.js";

const DRAFT_KEY = "daymate.focusDraft.v1";
const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function parseFocusDraft(text) {
  const { version, session } = JSON.parse(text);
  if (version !== 1 || !session || !Number.isInteger(session.task?.id) || session.task.id <= 0
      || typeof session.task.name !== "string" || typeof session.sessionKey !== "string"
      || !session.sessionKey || session.sessionKey.length > 100
      || !Number.isInteger(session.plannedSeconds) || session.plannedSeconds < 60
      || session.plannedSeconds > MAX_FOCUS_SECONDS || !finite(session.startedAt)
      || session.startedAt < 0 || !Number.isFinite(new Date(session.startedAt).getTime())
      || !finite(session.elapsedMs) || session.elapsedMs < 0
      || session.elapsedMs > session.plannedSeconds * 1000 || session.runningSince !== null) {
    throw new Error("Invalid focus draft");
  }
  if (session.snapshot !== null) {
    const record = session.snapshot;
    if (!record || record.task_id !== session.task.id || record.session_key !== session.sessionKey
        || record.planned_seconds !== session.plannedSeconds
        || record.seconds !== Math.floor(session.elapsedMs / 1000)
        || typeof record.complete_task !== "boolean"
        || record.started_at !== new Date(session.startedAt).toISOString()
        || typeof record.ended_at !== "string" || !Number.isFinite(Date.parse(record.ended_at))
        || Date.parse(record.ended_at) < session.startedAt - 1) {
      throw new Error("Invalid focus snapshot");
    }
  }
  return session;
}

export function readFocusDraft(storage) {
  try {
    const text = storage?.getItem(DRAFT_KEY);
    return { session: text ? parseFocusDraft(text) : null, warning: "" };
  } catch {
    return { session: null, warning: "上次专注草稿无法读取，未自动恢复。" };
  }
}

export function writeFocusDraft(storage, session, now) {
  try {
    if (!storage) throw new Error("Unavailable storage");
    if (session) storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, session: pauseSession(session, now) }));
    else storage.removeItem(DRAFT_KEY);
    return "";
  } catch {
    return "专注草稿无法保存到浏览器，刷新后的恢复可能不可用。";
  }
}

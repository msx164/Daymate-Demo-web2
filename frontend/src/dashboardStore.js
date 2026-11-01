import { request } from "./api.js";

const nonnegative = (value) => Number.isInteger(value) && value >= 0;
const date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
export function validateDashboard([tasks, total, sessions, week, companion, streak]) {
  if (!Array.isArray(tasks) || !tasks.every((task) => task && Number.isInteger(task.id)
      && task.id > 0 && typeof task.name === "string" && typeof task.completed === "boolean"
      && date(task.task_date) && typeof task.start_time === "string"
      && typeof task.end_time === "string" && typeof task.task_type === "string")
      || !total || !nonnegative(total.total_seconds) || !nonnegative(total.today_seconds)
      || !date(total.today_date) || !Array.isArray(sessions) || !sessions.every((item) => item
        && Number.isInteger(item.id) && typeof item.task_name === "string" && nonnegative(item.seconds)
        && typeof item.started_at === "string" && Number.isFinite(Date.parse(item.started_at))
        && typeof item.ended_at === "string" && Number.isFinite(Date.parse(item.ended_at)))
      || !Array.isArray(week) || !week.every((item) => item && date(item.date) && nonnegative(item.seconds))
      || !nonnegative(companion?.companion_days) || !nonnegative(streak?.streak_days)) {
    throw new Error("任务或统计数据格式错误");
  }
  return { tasks, total, sessions, week, companionDays: companion.companion_days, streak: streak.streak_days };
}
export async function loadDashboard(signal) {
  return validateDashboard(await Promise.all([
    "/api/tasks", "/api/focus-total", "/api/focus-sessions/today", "/api/focus-week",
    "/api/companion-days", "/api/focus-streak",
  ].map((path) => request(path, { signal }))));
}
export function createDashboardStore(load = loadDashboard) {
  let state = { data: null, loading: false, error: "" };
  let revision = 0;
  let active;
  const listeners = new Set();
  const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  const invalidate = () => { revision++; active?.abort(); };
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { invalidate(); },
    updateTasks(update) {
      invalidate();
      emit({ loading: false, data: state.data ? { ...state.data, tasks: update(state.data.tasks) } : null });
    },
    async refresh() {
      invalidate();
      const current = revision;
      active = new AbortController();
      emit({ loading: true });
      try {
        const data = await load(active.signal);
        if (current === revision) emit({ data, loading: false, error: "" });
      } catch (error) {
        if (current === revision) emit({ loading: false, error: `数据读取失败：${error.message}。请检查后端连接后重试。` });
      }
    },
  };
}

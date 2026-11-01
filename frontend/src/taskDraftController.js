import { requestTaskDraft, validTaskDate } from "./taskDraft.js";

export function createTaskDraftController(generate = requestTaskDraft) {
  let view = { busy: false, error: "", draft: null, goal: "", taskDate: "" };
  let revision = 0, active;
  const listeners = new Set();
  const emit = (patch) => { view = { ...view, ...patch }; listeners.forEach((fn) => fn()); };
  const cancel = () => { revision++; active?.abort(); emit({ busy: false }); };
  return {
    getSnapshot: () => view,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    cancel,
    dispose: cancel,
    async generate(goal, taskDate) {
      if (view.busy) return false;
      goal = goal.trim();
      if (!goal || Array.from(goal).length > 4000 || !validTaskDate(taskDate)) {
        emit({ error: "请输入有效目标和任务日期" }); return false;
      }
      active = new AbortController();
      const current = ++revision;
      emit({ busy: true, error: "", draft: null, goal, taskDate });
      try {
        const draft = await generate(goal, taskDate, active.signal);
        if (current === revision) emit({ draft });
      } catch (error) {
        if (current === revision) emit({ error: `生成失败：${error.message}` });
      } finally { if (current === revision) emit({ busy: false }); }
      return true;
    },
  };
}

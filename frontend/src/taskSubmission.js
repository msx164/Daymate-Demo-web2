export function isTaskCreateUncertain(failure) {
  return ["TypeError", "TimeoutError", "AbortError"].includes(failure.name)
    || failure.status === 408 || failure.status >= 500;
}
export function createTaskSubmissionController({ idempotent = false, newKey = () => crypto.randomUUID(), operation = "创建" } = {}) {
  let view = { saving: false, uncertain: false, created: false, error: "" };
  const listeners = new Set();
  let frozenTask = null;
  let requestKey = null;
  const emit = (patch) => { view = { ...view, ...patch }; listeners.forEach((fn) => fn()); };
  return {
    getSnapshot: () => view,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async submit(task, create) {
      if (view.saving || (view.uncertain && !idempotent) || view.created) return false;
      if (idempotent && !frozenTask) { frozenTask = { ...task }; requestKey = newKey(); }
      emit({ saving: true, error: "" });
      try {
        await create(frozenTask ?? task, requestKey);
        emit({ created: true });
        return true;
      } catch (failure) {
        const uncertain = isTaskCreateUncertain(failure);
        if (!uncertain) { frozenTask = null; requestKey = null; }
        emit({ uncertain, error: uncertain ? idempotent ? "创建结果未确认；可点击同一按钮重试原内容，编号保持不变。"
          : `${operation}结果未确认，请关闭弹窗后检查任务列表。`
          : `${operation}失败：${failure.message}` });
        return false;
      } finally { emit({ saving: false }); }
    },
  };
}

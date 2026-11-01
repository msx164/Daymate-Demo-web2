import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { request } from "../api.js";
import { createDashboardStore } from "../dashboardStore.js";

export function DeletedTasks({ onRestore, onClose }) {
  const [store] = useState(() => createDashboardStore(async (signal) => {
    const tasks = await request("/api/tasks?deleted=true", { signal });
    if (!Array.isArray(tasks) || !tasks.every((task) => task && Number.isInteger(task.id) && typeof task.name === "string")) {
      throw new Error("已删除任务格式错误");
    }
    return { tasks };
  }));
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const locks = useRef(new Set());
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState("");
  useEffect(() => { void store.refresh(); return () => store.dispose(); }, [store]);
  async function restore(task) {
    if (locks.current.has(task.id)) return;
    locks.current.add(task.id); setPending(new Set(locks.current)); setError("");
    try {
      const restored = await request(`/api/tasks/${task.id}/restore`, { method: "POST" });
      store.updateTasks((tasks) => tasks.filter((item) => item.id !== task.id));
      onRestore(restored);
    } catch (failure) { setError(`恢复失败：${failure.message}。可重试。`); }
    finally { locks.current.delete(task.id); setPending(new Set(locks.current)); }
  }
  const close = () => { if (!locks.current.size) onClose(); };
  return <div className="modal-overlay" onClick={close}><div className="task-modal" role="dialog" aria-modal="true"
    aria-labelledby="deleted-task-title" onClick={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><h2 id="deleted-task-title">已删除任务</h2><p>恢复原日期、完成状态和任务编号</p></div>
      <button className="modal-close" disabled={pending.size > 0} onClick={close} aria-label="关闭">×</button></div>
    {(view.error || error) && <p role="alert" className="form-error">{error || view.error}</p>}
    {view.loading && <p role="status">正在读取…</p>}
    {!view.loading && !view.error && !view.data?.tasks.length && <p className="empty-task">暂无已删除任务</p>}
    {view.data?.tasks.map((task) => <div className="deleted-task-row" key={task.id}><div><strong>{task.name}</strong>
      <p>{task.task_date} · {task.start_time}–{task.end_time} · {task.completed ? "已完成" : "未完成"}</p></div>
      <button disabled={pending.has(task.id)} onClick={() => restore(task)}>{pending.has(task.id) ? "恢复中…" : "恢复"}</button></div>)}
    <div className="modal-actions"><button disabled={view.loading || pending.size > 0} onClick={store.refresh}>刷新列表</button>
      <button className="cancel-button" disabled={pending.size > 0} onClick={close}>关闭</button></div>
  </div></div>;
}

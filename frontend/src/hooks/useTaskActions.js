import { useRef, useState } from "react";
import { request } from "../api.js";

export function useTaskActions(updateTasks) {
  const locks = useRef(new Set());
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState("");
  async function change(task, remove) {
    if (locks.current.has(task.id)) return;
    locks.current.add(task.id);
    setPending(new Set(locks.current));
    setError("");
    try {
      const updated = await request(`/api/tasks/${task.id}`, remove ? { method: "DELETE" } : {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !task.completed }),
      });
      updateTasks((tasks) => remove ? tasks.filter((item) => item.id !== task.id)
        : tasks.map((item) => item.id === task.id ? updated : item));
    } catch (failure) { setError(`任务操作失败：${failure.message}。可以重试。`); }
    finally { locks.current.delete(task.id); setPending(new Set(locks.current)); }
  }
  return { pending, error, toggle: (task) => change(task, false), remove: (task) => change(task, true) };
}

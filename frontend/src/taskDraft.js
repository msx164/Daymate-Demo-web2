import { API_URL, apiHeaders } from "./api.js";

const TYPES = ["学习", "工作", "阅读", "运动", "整理", "生活"];
export function validTaskDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validateTaskDraft(data, targetDate) {
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).sort().join(",") !== "end_time,name,start_time,task_date,task_type"
    || typeof data.name !== "string" || !data.name.trim() || Array.from(data.name).length > 200
    || !validTaskDate(data.task_date) || data.task_date !== targetDate
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.start_time)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.end_time) || !TYPES.includes(data.task_type)) {
    throw new Error("AI 任务草稿格式无效，请重新生成");
  }
  return { name: data.name.trim(), task_date: data.task_date, start_time: data.start_time,
    end_time: data.end_time, task_type: data.task_type };
}
export async function requestTaskDraft(goal, taskDate, signal) {
  const response = await fetch(`${API_URL}/api/ai/task-draft`, {
    method: "POST", headers: apiHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ goal, task_date: taskDate }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(125000)]) : AbortSignal.timeout(125000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : `草稿生成失败 (${response.status})`);
  }
  return validateTaskDraft(await response.json(), taskDate);
}

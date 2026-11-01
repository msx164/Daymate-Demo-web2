import { session } from './web2/session.js';
const desktop = typeof window !== "undefined" ? window.daymateDesktop : null;
export const API_URL = desktop?.apiURL || import.meta.env?.VITE_API_URL || "http://127.0.0.1:8016";
export function apiHeaders(headers = {}) {
  return { ...headers, ...(session()?.token ? { Authorization: `Bearer ${session().token}` } : {}), ...(desktop?.connectionToken ? { "X-Daymate-Desktop-Token": desktop.connectionToken } : {}) };
}

export async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: apiHeaders(options.headers),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((item) => item.msg).join("；");
    } catch { /* Keep the HTTP status when the response is not JSON. */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function saveFocus(snapshot) {
  if (snapshot.seconds > 0) {
    return request("/api/focus-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  }
  // Completing immediately still completes the task, but creates no zero-second activity.
  if (snapshot.complete_task) {
    return request(`/api/tasks/${snapshot.task_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
  }
}

import { useEffect, useState } from "react";
import { request } from "../api.js";

export function CompanionLibrary({ chat, onPreferences }) {
  const [archive, setArchive] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([request("/api/companion/history", { signal: controller.signal }),
      request("/api/companion/preferences", { signal: controller.signal })]).then(([history, settings]) => {
      if (controller.signal.aborted) return;
      setArchive(history); setPreferences(settings); onPreferences(settings);
    }, () => { if (!controller.signal.aborted) setError("本机存档读取失败，请重新读取。"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [onPreferences]);
  async function action(kind) {
    if (busy || chat.busy) return;
    if (["load", "delete", "reset"].includes(kind) && !window.confirm(kind === "load"
      ? "用本机存档替换当前标签页的对话？不会自动发送消息。" : kind === "reset" ? "删除保存的个人偏好？" : "删除本机存档？当前标签页仍保留对话，模型服务收到的内容无法撤回。")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (kind === "read") {
        const [history, settings] = await Promise.all([request("/api/companion/history"), request("/api/companion/preferences")]);
        setArchive(history); setPreferences(settings); onPreferences(settings);
      } else if (kind === "load") {
        // Fetch again before loading so another window's latest snapshot is used.
        const history = await request("/api/companion/history");
        setArchive(history);
        if (!chat.restoreMessages(history.messages)) throw Error("对话未能载入");
      } else if (kind === "save" || kind === "delete") {
        const history = await request("/api/companion/history", { method: kind === "save" ? "PUT" : "DELETE",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: archive.revision,
            ...(kind === "save" ? { messages: chat.messages } : {}) }) });
        setArchive(history);
      } else {
        const settings = await request("/api/companion/preferences", { method: kind === "reset" ? "DELETE" : "PUT",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "reset" ? { revision: preferences.revision } : preferences) });
        setPreferences(settings); onPreferences(settings);
      }
      setNotice(kind === "delete" ? "本机存档已删除，当前对话未清空。" : kind === "save" ? "对话已保存到本机，可在重启后载入。" : kind === "load" ? "已载入本机存档。" : "本机数据已更新。");
    } catch (failure) { setError(`${failure.message}。结果未确认时请先重新读取，避免覆盖其他窗口。`); }
    finally { setBusy(false); }
  }
  const disabled = busy || chat.busy;
  return <details className="companion-library"><summary>本机存档与陪伴偏好</summary>
    <p className="form-hint">手动保存最近最多 50 轮对话，可跨重启载入。仅保存到当前后端的 SQLite；同一后端的窗口共享一份存档。不会自动发送给模型。</p>
    <p>存档：{archive ? `${archive.messages.length / 2} 轮` : "未读取"}</p>
    <div className="chat-actions">
      <button disabled={disabled} onClick={() => action("read")}>重新读取</button>
      <button disabled={disabled || !archive || !chat.messages.length} onClick={() => action("save")}>保存本机存档</button>
      <button disabled={disabled || !archive?.messages.length} onClick={() => action("load")}>载入本机存档</button>
      <button disabled={disabled || !archive?.messages.length} onClick={() => action("delete")}>删除本机存档</button>
    </div>
    {preferences && <form onSubmit={event => { event.preventDefault(); void action("preferences"); }}>
      <div className="form-group"><label htmlFor="companion-nickname">希望如何称呼你</label>
        <input id="companion-nickname" maxLength={40} disabled={disabled} value={preferences.nickname} onChange={event => setPreferences({ ...preferences, nickname: event.target.value })} /></div>
      <div className="form-group"><label htmlFor="companion-tone">交流风格</label>
        <select id="companion-tone" disabled={disabled} value={preferences.tone} onChange={event => setPreferences({ ...preferences, tone: event.target.value })}>
          <option value="gentle">温和鼓励</option><option value="direct">直接简洁</option></select></div>
      <div className="form-group"><label htmlFor="companion-goal">近期目标</label>
        <textarea id="companion-goal" maxLength={300} disabled={disabled} value={preferences.goal} onChange={event => setPreferences({ ...preferences, goal: event.target.value })} /></div>
      <div className="chat-actions"><button disabled={disabled}>保存偏好</button>
        <button type="button" disabled={disabled} onClick={() => action("reset")}>删除偏好</button></div>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-hint" role="status">{notice}</p>}
  </details>;
}

import { useEffect, useState } from "react";

export function DesktopControls() {
  const bridge = typeof window !== "undefined" ? window.daymateDesktop : null;
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.getStatus().then(value => { if (active) setStatus(value); }, () => { if (active) setError("桌面状态读取失败"); });
    const unsubscribe = bridge.onStatus(value => { if (active) setStatus(value); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  if (!bridge) return null;
  async function toggle() {
    if (saving || !status) return;
    setSaving(true); setError("");
    try { setStatus(await bridge.setReminders(!status.remindersEnabled)); }
    catch { setError("提醒设置失败，请检查系统是否支持通知"); }
    finally { setSaving(false); }
  }
  async function testNotification() {
    if (saving) return;
    setSaving(true); setError("");
    try { setStatus(await bridge.testNotification()); }
    catch { setError("测试通知发送失败，请稍后重试或检查系统通知设置"); }
    finally { setSaving(false); }
  }
  async function togglePet() {
    if (saving || !status) return;
    setSaving(true); setError("");
    try { setStatus(await bridge.setPetVisible(!status.petVisible)); }
    catch { setError("桌宠操作失败，请从托盘重试。"); }
    finally { setSaving(false); }
  }
  async function openLocal(kind) {
    setError("");
    try { await (kind === "config" ? bridge.openConfig() : bridge.openData()); }
    catch { setError(kind === "config" ? "请用文本编辑器打开模型配置：安装版在 %APPDATA%\\Daymate\\backend.env，开发版在 backend/.env。" : "本机数据目录无法打开"); }
  }
  return <div className="desktop-controls"><div><strong>桌面模式</strong>
    <p>关闭窗口会收起到托盘；从托盘菜单退出。开启后按任务开始时间提醒，休眠后仅补发近两分钟的提醒。</p></div>
    <button disabled={saving || !status || (!status.notificationsSupported && !status.remindersEnabled)} onClick={toggle} aria-pressed={status?.remindersEnabled ?? false}>
      {saving ? "正在设置…" : status?.remindersEnabled ? "关闭任务提醒" : "开启任务提醒"}</button>
    <button disabled={saving || !status?.notificationsSupported} onClick={testNotification}>测试通知</button>
    <button disabled={saving || !status} onClick={togglePet} aria-pressed={status?.petVisible ?? false}>{status?.petVisible ? "隐藏桌宠" : "显示桌宠"}</button>
    <button onClick={() => openLocal("config")}>打开模型配置</button>
    <button onClick={() => openLocal("data")}>打开数据目录</button>
    {status?.packaged && <p className="form-hint">数据保存在本机用户目录。修改模型配置并保存后，点击聊天区的检查配置即可生效。</p>}
    {status && !status.notificationsSupported && <p className="form-hint">当前系统不支持桌面通知。</p>}
    {(error || status?.error) && <p className="form-error" role="alert">{error || status.error}</p>}
  </div>;
}

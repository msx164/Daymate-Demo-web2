import { useRef, useState } from 'react';
export function DatabaseSnapshots() {
  const bridge = window.daymateDesktop;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const locked = useRef(false);
  async function execute(kind) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const result = await bridge.databaseSnapshot(kind);
      setMessage(result.canceled ? '已取消，当前数据不变。' : result.ok ? `已生成${kind === 'backup' ? '备份' : '恢复副本'}：${result.tasks} 项任务、${result.focus_sessions} 条专注记录。当前数据库未切换。` : result.failure || '操作未完成。');
    } catch { setMessage('数据工具不可用，请从托盘退出并重启新版 Demo。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="database-snapshots"><h3>数据库备份与恢复副本</h3>
    <p>备份包含数据库中的任务、专注、已保存的对话及偏好；不包含密钥、角色图片或尚未保存的标签页草稿。</p>
    {bridge?.databaseSnapshot ? <div className="diagnostic-actions"><button disabled={busy} onClick={() => execute('backup')}>备份当前数据库</button>
      <button disabled={busy} onClick={() => execute('restore')}>从备份生成恢复副本</button></div> : <p>请在新版桌面 Demo 中使用本地数据工具。</p>}
    <p className="form-hint">只生成新文件，不覆盖已有文件，不自动切换当前数据库。恢复前检查结构与完整性；含个人记录，请妥善保管。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}

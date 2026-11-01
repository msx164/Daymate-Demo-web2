import { useEffect, useRef, useState } from 'react';
export function DatabaseSelection() {
  const bridge = window.daymateDesktop;
  const [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    bridge?.databaseSelection?.('status').then(value => { if (alive) setStatus(value); }).catch(() => { if (alive) setMessage('数据源状态不可用，请完整退出后重启新版 Demo。'); });
    return () => { alive = false; };
  }, [bridge]);
  async function execute(kind) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const value = await bridge.databaseSelection(kind); setStatus(value);
      setMessage(value.canceled ? '已取消。' : value.failure || (kind === 'cancel' ? '已撤销待启用操作。' : '已安排，请先保存当前操作，从托盘退出后重启。'));
    } catch { setMessage('数据源操作不可用，请完整退出后重启新版 Demo。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="database-selection"><h3>启用恢复数据库</h3>
    <p>选择备份后生成应用管理的独立副本，下次启动才切换。原库及备份源保留，数据不会合并；启用失败时回退。</p>
    {status && <p className="database-selection-status">当前：{status.usingRestored ? '恢复数据库' : '原数据库'}。{status.pending ? `下次启动：${status.pendingRestored ? '恢复副本' : '原数据库'}。` : '没有待启用操作。'}</p>}
    {bridge?.databaseSelection ? <div className="diagnostic-actions">
      <button disabled={busy} onClick={() => execute('restore')}>选择备份并安排启用</button>
      {status?.pending && <button disabled={busy} onClick={() => execute('cancel')}>撤销待启用操作</button>}
      {status?.canRevert && <button disabled={busy} onClick={() => execute('original')}>下次启动切回原数据库</button>}
    </div> : <p>请使用新版桌面 Demo。</p>}
    {status?.warning && <p className="form-error">{status.warning}</p>}
    <p className="form-hint">重启前请保存专注、对话和草稿。角色图片与密钥不随数据库切换；现有浏览器草稿也不会迁入恢复库。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}

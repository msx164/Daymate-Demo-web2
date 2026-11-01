import { useEffect, useState } from 'react';

export function RuntimeDiagnostics() {
  const bridge = window.daymateDesktop;
  const [report, setReport] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (!bridge?.getDiagnostics) return;
    let active = true;
    bridge.getDiagnostics().then(value => { if (active) setReport(value); }, () => { if (active) setMessage('桌面诊断接口不可用，请从托盘退出并重新启动 Demo，以加载最新桌面程序。'); });
    return () => { active = false; };
  }, [bridge]);
  async function action(kind) {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      if (kind === 'check') { setReport(await bridge.getDiagnostics()); setMessage('运行状态已更新。'); }
      if (kind === 'copy') { await bridge.copyDiagnostics(); setMessage('诊断已复制，仅包含版本、构建标识和连接状态。'); }
      if (kind === 'refresh') {
        const result = await bridge.refreshInterface();
        if (!result?.refreshed) setMessage(result?.reason === 'busy' ? '请先处理未保存操作，再刷新界面。' : '当前无法刷新，请稍后重试。');
      }
    } catch { setMessage('操作未完成，请重新检查或从托盘退出后重启 Demo。'); }
    finally { setBusy(false); }
  }
  return <section className="runtime-diagnostics" aria-labelledby="runtime-title">
    <h3 id="runtime-title">运行状态与诊断</h3>
    <dl><div><dt>界面构建时间</dt><dd>{import.meta.env.VITE_DAYMATE_BUILD ? new Date(import.meta.env.VITE_DAYMATE_BUILD).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '（北京时间）' : '开发模式'}</dd></div>
      <div><dt>运行模式</dt><dd>{report ? ({ demo: '桌面 Demo', source: '源码桌面版', installed: '安装版' })[report.mode] || '未知' : bridge ? '桌面模式 · 待读取' : '网页模式'}</dd></div>
      {report && <><div><dt>应用版本</dt><dd>{report.appVersion}</dd></div><div><dt>当前／最新构建</dt><dd>{report.loadedBuild} / {report.latestBuild}</dd></div>
        <div><dt>后端连接</dt><dd>{report.backend === 'connected' ? '连接正常' : '无法连接，请重启后重试'}</dd></div></>}
    </dl>
    {report?.updateAvailable && <p role="status">发现更新后的界面构建，可在处理未保存操作后刷新。</p>}
    {bridge?.getDiagnostics ? <div className="diagnostic-actions"><button disabled={busy} onClick={() => action('check')}>重新检查运行状态</button>
      <button disabled={busy || !report} onClick={() => action('copy')}>复制诊断信息</button><button disabled={busy} onClick={() => action('refresh')}>安全刷新界面</button></div>
      : <p>{bridge ? '当前桌面程序较旧，请从托盘退出并重新运行 Demo，以启用完整诊断。' : '完整诊断在 Electron 桌面版可用。'}</p>}
    <p className="form-hint">诊断不包含密钥、地址、文件路径、任务或聊天内容。这里只检查本机后端，不调用模型服务，也不代表数据库完整性检查。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}

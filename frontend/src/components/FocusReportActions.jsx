import { useRef, useState, useEffect } from 'react';
import { API_URL, apiHeaders, request } from '../api.js';
import { compareFocusTotals } from '../focusAudit.js';

export function FocusReportActions({ start, end, count }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(true), controller = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  async function run(kind) {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setMessage('');
    try {
      if (kind === 'audit') {
        const week = await request('/api/focus-week', { signal: abort.signal });
        if (!Array.isArray(week) || week.length !== 7) throw Error('趋势数据格式错误');
        const params = new URLSearchParams({ start_date: week[0].date, end_date: week[6].date, limit: 1 });
        const history = await request('/api/focus-history?' + params, { signal: abort.signal });
        const result = compareFocusTotals(week, history);
        if (alive.current) setMessage(result.matched ? `近七天统计核对一致：${result.historySeconds} 秒。` : '两次读取的统计不一致，期间可能新增了记录，请刷新后重新核对。');
      } else {
        const response = await fetch(API_URL + '/api/focus-history/csv?' + new URLSearchParams({ start_date: start, end_date: end }),
          { headers: apiHeaders(), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) { let detail; try { detail = (await response.json()).detail; } catch { /* Generic error below. */ } throw Error(typeof detail === 'string' ? detail : '导出失败，请重试'); }
        const blob = await response.blob();
        if (alive.current) {
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = `daymate-focus-${start}-${end}.csv`; document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage('已发起所选区间的 CSV 下载，请查看系统下载位置。');
        }
      }
    } catch (error) { if (alive.current && !abort.signal.aborted) setMessage(error.message || '操作失败，请重试'); }
    finally { controller.current = null; if (alive.current) setBusy(false); }
  }
  return <div className="focus-report-actions"><div className="diagnostic-actions">
    <button disabled={busy || count === 0} onClick={() => run('export')}>导出所选区间 CSV</button>
    <button disabled={busy} onClick={() => run('audit')}>核对近七天统计</button></div>
    <p className="form-hint">CSV 包含所选区间全部记录（最多 5000 条），含任务名称，请自行保管。核对比较两次读取，不是数据库修复或完整性检查。</p>
    {message && <p role="status">{message}</p>}</div>;
}

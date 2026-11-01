import { useEffect, useState } from 'react';
import { request } from '../api.js';
import { chinaDate, formatFocusDuration } from '../dashboardUtils.js';
import { FocusHistory } from './FocusHistory.jsx';
import { FocusReportActions } from './FocusReportActions.jsx';

export function FocusExplorer({ refreshToken }) {
  const today = chinaDate();
  const [start, setStart] = useState(today), [end, setEnd] = useState(today);
  const [query, setQuery] = useState({ start: today, end: today, offset: 0, revision: 0 });
  const [view, setView] = useState({ key: '', token: null, data: null, error: '' });
  const key = JSON.stringify(query), loading = view.key !== key || view.token !== refreshToken;
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    const params = new URLSearchParams({ start_date: query.start, end_date: query.end, offset: query.offset, limit: 25 });
    request('/api/focus-history?' + params, { signal: abort.signal }).then(data => {
      if (active) setView({ key, token: refreshToken, data, error: '' });
    }, error => { if (active) setView({ key, token: refreshToken, data: null,
      error: error.status === 404 ? '当前后端尚未支持历史查询，请从托盘退出并重新启动 Demo。' : error.message }); });
    return () => { active = false; abort.abort(); };
  }, [key, query, refreshToken]);
  function search(event) { event.preventDefault(); setQuery(previous => ({ start, end, offset: 0, revision: previous.revision + 1 })); }
  function preset(days) {
    const date = new Date(today + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() - days + 1);
    const value = date.toISOString().slice(0, 10); setStart(value); setEnd(today);
    setQuery(previous => ({ start: value, end: today, offset: 0, revision: previous.revision + 1 }));
  }
  return <section className="panel focus-explorer" aria-labelledby="history-query-title">
    <h2 id="history-query-title">查询专注历史</h2>
    <p className="form-hint">按中国时区的开始日期查询，包含结束日期；跨午夜记录归开始日，最多查询 366 天。</p>
    <form className="history-query" onSubmit={search}>
      <label>开始日期<input aria-label="专注记录开始日期" type="date" required value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>结束日期<input aria-label="专注记录结束日期" type="date" required value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button className="primary-button" type="submit">查询记录</button>
      {[1, 7, 30].map(days => <button type="button" key={days} onClick={() => preset(days)}>{days === 1 ? '今天' : `近 ${days} 天`}</button>)}
    </form>
    <div aria-live="polite">{loading ? <p>正在查询记录…</p> : view.error ? <p className="form-error" role="alert">{view.error}</p> : view.data && <>
      <p className="history-summary">{view.data.start_date} 至 {view.data.end_date} · {view.data.count} 条 · 累计 {formatFocusDuration(view.data.total_seconds)}</p>
      <div className="workspace-summary"><span>区间专注 <strong>{formatFocusDuration(view.data.total_seconds)}</strong></span>
        <span>有专注记录的天数 <strong>{view.data.active_days} 天</strong></span>
        <span>活跃日平均 <strong>{formatFocusDuration(view.data.average_active_day_seconds)}</strong></span></div>
      <FocusReportActions key={key} start={view.data.start_date} end={view.data.end_date} count={view.data.count} />
      <FocusHistory todaySessions={view.data.items} title="查询结果" emptyMessage="该日期区间没有专注记录" />
      <div className="history-pagination"><button disabled={query.offset === 0} onClick={() => setQuery(value => ({ ...value, offset: Math.max(0, value.offset - 25) }))}>上一页</button>
        <span>第 {Math.floor(query.offset / 25) + 1} / {Math.max(1, Math.ceil(view.data.count / 25))} 页</span>
        <button disabled={query.offset + 25 >= view.data.count} onClick={() => setQuery(value => ({ ...value, offset: value.offset + 25 }))}>下一页</button></div>
    </>}</div>
  </section>;
}

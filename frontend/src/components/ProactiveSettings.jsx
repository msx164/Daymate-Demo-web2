import { useEffect, useState } from 'react';
import { request } from '../api.js';
import './ProactiveSettings.css';

function ReminderForm({ initial, tasks, habits, today, onReload }) {
  const bridge = window.daymateDesktop;
  const [meta, setMeta] = useState(initial);
  const [draft, setDraft] = useState(initial.config);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(meta.config);
  const update = value => setDraft(current => ({ ...current, ...value }));
  const select = (key, id, checked) => setDraft(current => ({ ...current,
    [key]: checked ? [...new Set([...current[key], id])] : current[key].filter(value => value !== id) }));
  async function operate(kind) {
    if (busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const value = await bridge.proactive(kind, kind === 'save' ? draft : undefined);
      setMeta(value);
      if (kind === 'save') setDraft(value.config);
      setMessage(kind === 'save' ? '设置已保存，新的提醒间隔从现在开始计算。' : '主动陪伴提醒已暂停一小时。');
    } catch (value) { setError(value.message || '设置未保存，请重新读取后核对。'); }
    finally { setBusy(false); }
  }
  return <form className="proactive-form" data-unsaved={dirty} aria-busy={busy} onSubmit={event => { event.preventDefault(); void operate('save'); }}>
    <label><input type="checkbox" checked={draft.enabled} disabled={busy || !meta.supported} onChange={event => update({ enabled: event.target.checked })} />启用主动陪伴提醒</label>
    <p>只提醒你明确选择的安排，每天最多三次；仅本机运行，不调用 AI、不上传数据、不自动朗读。点击通知只打开主窗口。</p>
    <fieldset disabled={busy}><legend>提醒节奏</legend>
      <label>提醒间隔<select value={draft.intervalMinutes} onChange={event => update({ intervalMinutes: Number(event.target.value) })}>
        {[15, 30, 60, 120].map(value => <option key={value} value={value}>{value} 分钟</option>)}</select></label>
      <label><input type="checkbox" checked={draft.quietEnabled} onChange={event => update({ quietEnabled: event.target.checked })} />启用安静时段（中国时区）</label>
      <label>安静开始<input type="time" required value={draft.quietStart} onChange={event => update({ quietStart: event.target.value })} /></label>
      <label>安静结束<input type="time" required value={draft.quietEnd} onChange={event => update({ quietEnd: event.target.value })} /></label>
    </fieldset>
    <fieldset disabled={busy}><legend>允许提醒的任务</legend>
      <p>仅提醒今日未完成且开始时间已过两分钟的任务。选择未来任务后，到了对应日期才会提醒。</p>
      <div className="proactive-choices">{tasks.filter(task => task.task_date >= today || draft.taskIds.includes(task.id)).map(task => <label key={task.id}>
        <input type="checkbox" checked={draft.taskIds.includes(task.id)} onChange={event => select('taskIds', task.id, event.target.checked)} />
        {task.name} · {task.task_date}{task.completed ? ' · 已完成，不提醒' : ''}</label>)}</div>
      {!tasks.some(task => task.task_date >= today || draft.taskIds.includes(task.id)) && <p>没有可选任务，请先去任务页添加。</p>}
    </fieldset>
    <fieldset disabled={busy}><legend>允许提醒的习惯</legend>
      <p>只提醒当日有安排、未打卡且未归档的习惯；新建习惯不会自动加入。</p>
      <div className="proactive-choices">{habits.filter(habit => !habit.archived_on).map(habit => <label key={habit.id}>
        <input type="checkbox" checked={draft.habitIds.includes(habit.id)} onChange={event => select('habitIds', habit.id, event.target.checked)} />{habit.name}</label>)}</div>
      {!habits.some(habit => !habit.archived_on) && <p>没有可选习惯，请先去任务页添加。</p>}
    </fieldset>
    <div className="proactive-actions"><button className="primary-button" disabled={busy || !dirty}>保存主动提醒设置</button>
      <button type="button" disabled={busy || !meta.config.enabled} onClick={() => operate('snooze')}>暂停提醒一小时</button>
      <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('重新读取会放弃此处未保存的设置，继续吗？')) onReload(); }}>重新读取提醒设置</button></div>
    {meta.snoozeUntil > now && <p>暂停至 {new Date(meta.snoozeUntil).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（中国时区）。</p>}
    <p>专注（含暂停）、聊天生成、朗读和视频陪伴时暂缓提醒。每次启动、保存配置或从休眠恢复后，等待完整间隔再检查；退出应用后不提醒。旧的“任务开始提醒”是独立开关。</p>
    {!meta.supported && <p>当前环境不支持系统通知，无法启用。</p>}
    {message && <p role="status">{message}</p>}
    {(error || meta.error) && <p role="alert" className="form-error">{error || meta.error}</p>}
  </form>;
}

export function ProactiveSettings() {
  const bridge = window.daymateDesktop;
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = () => { setLoaded(null); setError(''); setRevision(value => value + 1); };
  useEffect(() => {
    if (!bridge?.proactive) return;
    const controller = new AbortController();
    Promise.all([bridge.proactive('read'), request('/api/tasks', { signal: controller.signal }), request('/api/habits/overview', { signal: controller.signal })])
      .then(([initial, tasks, overview]) => { if (!controller.signal.aborted) { setLoaded({ initial, tasks, habits: overview.habits, today: overview.today }); setError(''); } })
      .catch(() => { if (!controller.signal.aborted) setError('提醒设置暂时无法读取，请检查连接后重试。'); });
    return () => controller.abort();
  }, [bridge, revision]);
  if (!bridge?.proactive) return <section className="proactive-settings"><h3>主动陪伴提醒</h3><p>请使用新版桌面 Demo 配置本地提醒。</p></section>;
  return <section className="proactive-settings" aria-labelledby="proactive-title"><h3 id="proactive-title">主动陪伴提醒</h3>
    {error ? <><p role="alert">{error}</p><button onClick={reload}>重试读取提醒</button></> : loaded ?
      <ReminderForm key={revision} {...loaded} onReload={reload} /> : <p role="status">正在读取提醒设置…</p>}
  </section>;
}

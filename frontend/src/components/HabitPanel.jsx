import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api.js';
import './HabitPanel.css';

const labels = ['一', '二', '三', '四', '五', '六', '日'];
const json = value => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

function HabitForm({ disabled, onCreate }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const attempt = useRef(null);
  async function submit(event) {
    event.preventDefault();
    if (disabled || !name.trim() || !days.length) return;
    const payload = { name: name.trim(), weekdays: [...days].sort() };
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    if (await onCreate({ ...payload, create_key: attempt.current.key })) {
      setName(''); attempt.current = null;
    }
  }
  return <form className="habit-create" data-unsaved={!!name.trim()} onSubmit={submit}>
    <label>新习惯<input value={name} maxLength={100} disabled={disabled} required placeholder="例如：阅读 10 分钟" onChange={event => setName(event.target.value)} /></label>
    <fieldset disabled={disabled}><legend>重复日期</legend><div className="habit-weekdays">{labels.map((label, day) => <label key={day}>
      <input type="checkbox" checked={days.includes(day)} onChange={event => setDays(current => event.target.checked ? [...current, day] : current.filter(value => value !== day))} />周{label}
    </label>)}</div></fieldset>
    <button className="primary-button" disabled={disabled || !name.trim() || !days.length}>添加习惯</button>
  </form>;
}

function ReflectionForm({ initial, week, revision, disabled, onSave }) {
  const [note, setNote] = useState(initial);
  return <form className="habit-reflection" data-unsaved={note.trim() !== initial} onSubmit={event => { event.preventDefault(); void onSave({ week_start: week, note, revision }); }}>
    <label>本周复盘 · {week} 起<textarea rows={4} maxLength={2000} readOnly={disabled} value={note}
      placeholder="这周做到了什么？遇到了什么困难？下周想做的一件小事是什么？" onChange={event => setNote(event.target.value)} /></label>
    <span>{note.length}/2000 · 仅保存在本机数据库</span>
    <button disabled={disabled || note.trim() === initial} className="primary-button">保存复盘</button>
  </form>;
}

export function HabitPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const alive = useRef(false);
  const refresh = useCallback(async (signal) => {
    const value = await request('/api/habits/overview', { signal });
    if (alive.current) setData(value);
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    refresh(controller.signal).catch(value => {
      if (!controller.signal.aborted) setError(value.message);
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { alive.current = false; controller.abort(); };
  }, [refresh]);

  async function operate(path, method, value, message) {
    if (locked.current || busy) return false;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    let committed = false;
    try {
      if (path) { await request(path, { method, ...(value ? json(value) : {}) }); committed = true; }
      await refresh();
      if (alive.current) setNotice(message || '习惯数据已更新');
      return true;
    } catch (value) {
      if (alive.current) {
        setError(committed ? `操作已保存，但列表刷新失败：${value.message}。请点击重新读取。` : value.message);
        if (committed) setNotice(message);
      }
      return committed;
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const disabled = busy || !!error || !data;
  const today = data?.habits.filter(habit => habit.due_today) ?? [];
  const total = data?.days.reduce((sum, day) => sum + day.planned, 0) ?? 0;
  const completed = data?.days.reduce((sum, day) => sum + day.completed, 0) ?? 0;
  return <section className="panel habit-panel" aria-labelledby="habit-title" aria-busy={busy}>
    <div className="panel-header"><div><h2 id="habit-title">习惯与复盘</h2><p>按中国时区安排每日习惯。打卡不改变任务状态和专注统计。</p></div>
      <button disabled={busy} onClick={() => operate(null)}>重新读取</button></div>
    {busy && <p role="status">正在更新习惯…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <HabitForm disabled={disabled} onCreate={value => operate('/api/habits', 'POST', value, '习惯已添加')} />
    {data && <>
      <h3>今日习惯 · {data.today}</h3>
      <p>已完成 {today.filter(habit => habit.completed_today).length} / {today.length}</p>
      {!today.length && <p>今天没有安排习惯，可以添加一项小目标。</p>}
      <ul className="habit-list">{data.habits.map(habit => <li key={habit.id}>
        <div><strong>{habit.name}</strong><p>{habit.weekdays.map(day => `周${labels[day]}`).join('、')}
          {habit.archived_on ? ' · 明日起归档' : !habit.due_today ? ' · 今日无安排' : ''}</p></div>
        {habit.due_today && <button disabled={disabled} aria-pressed={habit.completed_today}
          onClick={() => operate(`/api/habits/${habit.id}/checkin`, 'PUT', { day: data.today, completed: !habit.completed_today }, habit.completed_today ? '已撤销今日打卡' : '今日打卡已保存')}>
          {habit.completed_today ? '撤销打卡' : '今日打卡'}</button>}
        {!habit.archived_on && <button disabled={disabled} onClick={() => {
          if (window.confirm(`将“${habit.name}”归档？明日起不再安排，今日计划和历史记录保留。`)) void operate(`/api/habits/${habit.id}/archive`, 'PUT', null, '习惯已归档，明日起生效');
        }}>归档</button>}
      </li>)}</ul>
      <h3>近七天完成情况</h3><p>完成 {completed} / {total} 次{total ? `（${Math.round(completed / total * 100)}%）` : '（暂无安排）'}；只计创建后已到日期的安排。</p>
      <div className="habit-history"><table><caption>每日习惯完成次数</caption><thead><tr><th scope="col">日期</th><th scope="col">已完成</th><th scope="col">计划</th></tr></thead>
        <tbody>{data.days.map(day => <tr key={day.day}><th scope="row">{day.day}</th><td>{day.completed}</td><td>{day.planned}</td></tr>)}</tbody></table></div>
      <ReflectionForm key={`${data.week_start}:${data.reflection_revision}`} initial={data.reflection} week={data.week_start} revision={data.reflection_revision} disabled={disabled}
        onSave={value => operate('/api/habits/reflection', 'PUT', value, '本周复盘已保存')} />
      {!!data.past_reflections.length && <details><summary>最近八次历史复盘</summary>{data.past_reflections.map(item =>
        <article key={item.week_start}><h4>{item.week_start} 起</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.note || '（空白复盘）'}</p></article>)}</details>}
    </>}
  </section>;
}

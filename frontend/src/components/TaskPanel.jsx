import { useState } from 'react';
import { filterTasks } from '../taskFilters.js';
export function TaskPanel({ tasks, date, scope, onScope, onAdd, onStart, onToggle, onDelete, onEdit, onDeleted, pending, error, expanded = false, onQuickStart, quickStartDisabled = false }) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [type, setType] = useState('all');
  const visible = expanded ? filterTasks(tasks, { date, scope, query, status, type }) : scope === "today" ? tasks.filter((task) => task.task_date === date) : tasks;
  return <div className="panel" id="tasks"><div className="panel-header"><div>
    <div className="panel-title">{scope === "today" ? "今日任务" : "全部任务"}</div>
    <div className="panel-subtitle">{scope === "today" ? date : "包含过去与未来的任务"}</div></div>
    <div className="task-tools">{[["today", "今天"], ["all", "全部"]].map(([value, label]) =>
      <button key={value} className={scope === value ? "selected" : ""} aria-pressed={scope === value} onClick={() => onScope(value)}>{label}</button>)}
      <button className="add-button" aria-label="添加任务" onClick={onAdd}>＋</button></div></div>
    {expanded && <button className="deleted-tasks-link" onClick={onDeleted}>查看已删除任务</button>}
    {expanded && <div className="task-filters" role="group" aria-label="任务筛选">
      <label>搜索<input type="search" aria-label="搜索任务" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入任务名称" /></label>
      <label>状态<select aria-label="任务状态" value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option><option value="pending">未完成</option><option value="completed">已完成</option></select></label>
      <label>类型<select aria-label="任务类型筛选" value={type} onChange={event => setType(event.target.value)}><option value="all">全部类型</option>{[...new Set(tasks.map(task => task.task_type))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <button onClick={() => { setQuery(''); setStatus('all'); setType('all'); }}>清除筛选</button><span role="status">找到 {visible.length} 项任务</span>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-list">{visible.length === 0 ? <div className="empty-task">{expanded && (query || status !== 'all' || type !== 'all') ? '没有符合筛选条件的任务，试试清除筛选。' : scope === "today" ? "今天还没有任务" : "还没有任务"}</div>
      : visible.map((task) => <div className="task" key={task.id} aria-busy={pending.has(task.id)}>
        <button disabled={task.completed || pending.has(task.id)} onClick={() => onStart(task)}>开始专注</button>
        <button className={task.completed ? "task-check completed" : "task-check"} disabled={pending.has(task.id)}
          aria-label={`${task.completed ? "取消完成" : "完成"}：${task.name}`} onClick={() => onToggle(task)}>{task.completed ? "✓" : ""}</button>
        <div className="task-info"><div className={task.completed ? "task-name completed-text" : "task-name"}>{task.name}</div>
          <div className="task-time">{task.task_date} · {task.start_time} - {task.end_time}</div></div>
        <div className="task-tag">{task.task_type}</div>
        <button disabled={pending.has(task.id)} onClick={() => onEdit(task)}>编辑</button>
        <button className="delete-task" disabled={pending.has(task.id)} aria-label={`删除：${task.name}`} onClick={() => onDelete(task)}>×</button>
      </div>)}</div>
    {onQuickStart && <div className="home-panel-footer"><button className="primary-button" disabled={quickStartDisabled} onClick={onQuickStart}>快速开始</button></div>}
  </div>;
}

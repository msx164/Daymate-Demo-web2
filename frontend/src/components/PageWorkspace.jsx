import { filterTasks } from '../taskFilters.js';

const descriptions = {
  tasks: ['把计划变成下一步', '按日期、类型或完成状态整理任务，从一件小事开始。'],
  focus: ['留一点时间给当下', '选择任务，设置适合自己的时长。暂停和休息也是节奏的一部分。'],
  companion: ['你的陪伴空间', '调整角色与场景，聊聊目标，或把一段回复读给自己听。'],
  settings: ['让 Daymate 更适合你', '显示、专注偏好和桌面功能都在这里调整。'],
};
export function PageWorkspace({ page, tasks, date, onAdd, onTasks, onStart, pending }) {
  if (!descriptions[page]) return null;
  const [title, description] = descriptions[page];
  const today = tasks.filter(task => task.task_date === date);
  const candidates = filterTasks(tasks, { scope: 'all', status: 'pending' }).filter(task => task.task_date <= date).slice(0, 5);
  return <>
    <section className="workspace-banner" aria-label={`${title}引导`}>
      <div><span className="workspace-eyebrow">DAYMATE · {date || '今天'}</span><h2>{title}</h2><p>{description}</p></div>
      {page === 'tasks' && <button className="primary-button" onClick={onAdd}>＋ 新建任务</button>}
    </section>
    {page === 'tasks' && <div className="workspace-summary">
      <span>今日待完成 <strong>{today.filter(task => !task.completed).length}</strong></span>
      <span>今日已完成 <strong>{today.filter(task => task.completed).length}</strong></span>
      <span>全部任务 <strong>{tasks.length}</strong></span>
    </div>}
    {page === 'focus' && <section className="panel focus-workspace" aria-labelledby="focus-workspace-title">
      <div className="panel-header"><div><h2 id="focus-workspace-title">准备开始一轮专注</h2><p>选择今天或尚未完成的过去任务；每次开始前都可以调整时长。</p></div><button onClick={onTasks}>查看全部任务</button></div>
      {candidates.length ? candidates.map(task => <div className="focus-candidate" key={task.id}><div><strong>{task.name}</strong><p>{task.task_date} · {task.start_time} · {task.task_type}</p></div>
        <button className="primary-button" disabled={pending.has(task.id)} onClick={() => onStart(task)}>专注此任务</button></div>)
        : <div className="workspace-empty"><p>今天没有待专注的任务。可以新建一个小目标，或从全部任务中选择。</p><button className="primary-button" onClick={onAdd}>新建任务</button></div>}
      <p className="form-hint">支持 1–240 分钟；休眠继续计时，手动暂停不计入。到时后由你确认保存，下面可查看今日记录和最近 7 天趋势。</p>
    </section>}
    {page === 'companion' && <div className="companion-shortcuts" aria-label="陪伴快捷入口">
      <button onClick={() => { document.querySelector('#chat-input')?.scrollIntoView({ block: 'center' }); document.querySelector('#chat-input')?.focus({ preventScroll: true }); }}>和 Day 聊聊</button>
      <button onClick={() => document.querySelector('.scene-controls')?.scrollIntoView({ block: 'center' })}>调整形象与场景</button>
      <button onClick={() => { const element = document.querySelector('.speech-controls'); if (element) { element.open = true; element.scrollIntoView({ block: 'center' }); } }}>朗读设置</button>
    </div>}
  </>;
}

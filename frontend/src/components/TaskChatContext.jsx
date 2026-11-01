export function TaskChatContext({ tasks, selected, onChange, preview, disabled }) {
  const chosen = tasks.filter((task) => selected.has(task.id));
  return <details className="task-chat-context"><summary>分享今日任务（可选）{chosen.length > 0 ? ` · 已选 ${chosen.length} 项` : ""}</summary>
    <p className="chat-description">最多选择 5 项。下方预览会随消息发送。已发送的任务信息会随近期对话再次发送；清空对话可移除后续上下文。</p>
    {tasks.length === 0 ? <p className="form-hint">今天还没有可分享的任务。</p>
      : <fieldset disabled={disabled}><legend className="sr-only">选择要分享的今日任务</legend>
        {tasks.map((task) => <label className="chat-task-choice" key={task.id}>
          <input type="checkbox" checked={selected.has(task.id)} disabled={!selected.has(task.id) && chosen.length >= 5}
            onChange={(event) => { const next = new Set(chosen.map((item) => item.id));
              if (event.target.checked) next.add(task.id); else next.delete(task.id); onChange(next); }} />
          <span>{task.name} · {task.completed ? "已完成" : "未完成"}</span></label>)}
      </fieldset>}
    {preview && <div className="task-context-preview"><strong>将发送的任务内容</strong><pre>{preview}</pre>
      <button type="button" disabled={disabled} onClick={() => onChange(new Set())}>取消本次分享</button></div>}
  </details>;
}

import { useEffect, useState, useSyncExternalStore } from "react";
import { createTaskDraftController } from "../taskDraftController.js";
import { chinaDate } from "../dashboardUtils.js";

export function AiTaskPlanner({ onReview, onClose }) {
  const [controller] = useState(() => createTaskDraftController());
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [goal, setGoal] = useState("");
  const [taskDate, setTaskDate] = useState(() => chinaDate());
  const matches = goal.trim() === view.goal && taskDate === view.taskDate;
  useEffect(() => () => controller.dispose(), [controller]);
  const close = () => { controller.cancel(); onClose(); };
  return <div className="modal-overlay" onClick={close}><form className="task-modal ai-task-planner" role="dialog"
    aria-modal="true" aria-labelledby="ai-task-title" onClick={(event) => event.stopPropagation()}
    onSubmit={(event) => { event.preventDefault(); void controller.generate(goal, taskDate); }}>
    <div className="modal-header"><div><h2 id="ai-task-title">AI 任务草稿</h2>
      <p>先生成建议，审核后才创建任务</p></div><button type="button" className="modal-close" onClick={close} aria-label="关闭">×</button></div>
    <p className="chat-description">仅发送下方目标和所选日期，不会自动读取聊天或任务记录。草稿只保留在本次弹窗中，时间安排需要你确认。</p>
    <fieldset disabled={view.busy}>
      <div className="form-group"><label htmlFor="ai-task-goal">想完成什么？</label>
        <textarea id="ai-task-goal" required maxLength={4000} rows={4} value={goal}
          placeholder="例如：今天想复习高数，帮我安排一个能完成的小目标" onChange={(event) => setGoal(event.target.value)} /></div>
      <div className="form-group"><label htmlFor="ai-task-date">任务日期</label>
        <input id="ai-task-date" required type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} /></div>
    </fieldset>
    {view.busy && <p role="status" className="form-hint">正在生成，尚未创建任务…</p>}
    {view.error && <p className="form-error" role="alert">{view.error}</p>}
    {view.draft && <div className="ai-task-preview"><strong>{view.draft.name}</strong>
      <p>{view.draft.task_date} · {view.draft.start_time}–{view.draft.end_time} · {view.draft.task_type}</p>
      <p className="form-hint">这只是草稿，还未保存。</p>
      {!matches && <p className="form-error">目标或日期已改动，请重新生成草稿。</p>}
      <button type="button" className="save-button" disabled={!matches} onClick={() => onReview(view.draft)}>编辑并审核草稿</button></div>}
    <div className="modal-actions"><button type="button" className="cancel-button" onClick={close}>取消</button>
      {view.busy ? <button type="button" onClick={controller.cancel}>停止生成</button>
        : <button className="save-button">{view.draft ? "重新生成" : "生成一项草稿"}</button>}</div>
  </form></div>;
}

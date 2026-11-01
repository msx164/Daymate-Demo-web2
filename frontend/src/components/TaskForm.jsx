import { useState, useSyncExternalStore } from "react";
import { chinaDate } from "../dashboardUtils.js";
import { createTaskSubmissionController } from "../taskSubmission.js";
import { taskConflicts } from "../taskConflicts.js";

export function TaskForm({ onCreate, onClose, initialTask = null, editing = false, tasks = [], draftTitle }) {
  const [task, setTask] = useState(() => initialTask ? { ...initialTask } : ({ name: "", task_date: chinaDate(), start_time: "15:00",
    end_time: "16:00", task_type: "学习" }));
  const [error, setError] = useState("");
  const [submission] = useState(() => createTaskSubmissionController({ idempotent: !editing, operation: editing ? "修改" : "创建" }));
  const state = useSyncExternalStore(submission.subscribe, submission.getSnapshot, submission.getSnapshot);
  const { saving, uncertain } = state;
  const conflicts = taskConflicts(task, tasks, editing ? initialTask.id : null);
  const close = () => { if (!submission.getSnapshot().saving) onClose(); };
  const field = (name) => ({ value: task[name], onChange: (event) => setTask({ ...task, [name]: event.target.value }) });
  async function submit(event) {
    event.preventDefault();
    if (submission.getSnapshot().saving || (uncertain && editing)) return;
    if (!task.name.trim()) { setError("请输入任务名称"); return; }
    if (!uncertain && conflicts.length && !window.confirm(`与 ${conflicts.map((item) => item.name).join("、")} 时间重叠，仍然保存吗？`)) return;
    setError("");
    const payload = { name: task.name.trim(), task_date: task.task_date, start_time: task.start_time,
      end_time: task.end_time, task_type: task.task_type };
    if (await submission.submit(payload, onCreate)) onClose();
  }
  return <div className="modal-overlay" onClick={close}>
    <form className="task-modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title"
      onClick={(event) => event.stopPropagation()} onSubmit={submit}>
      <div className="modal-header"><div><h2 id="new-task-title">{editing ? "编辑任务" : initialTask ? draftTitle || "审核 AI 任务草稿" : "新建任务"}</h2>
        <p>{initialTask ? "请核对名称、日期和时间，确认后才会保存" : "设置一个要完成的小目标"}</p></div>
        <button type="button" className="modal-close" disabled={saving} onClick={close} aria-label="关闭">×</button></div>
      <fieldset disabled={saving || uncertain}>
        <div className="form-group"><label htmlFor="task-name">任务名称</label>
          <input id="task-name" required maxLength={200} placeholder="例如：完成高等数学作业" {...field("name")} /></div>
        <div className="form-group"><label htmlFor="task-date">任务日期</label>
          <input id="task-date" type="date" required {...field("task_date")} /></div>
        <div className="time-row">{[["start_time", "开始时间"], ["end_time", "结束时间"]].map(([name, label]) =>
          <div className="form-group" key={name}><label htmlFor={name}>{label}</label>
            <input id={name} type="time" required {...field(name)} /></div>)}</div>
        <div className="form-group"><label htmlFor="task-type">任务类型</label>
          <select id="task-type" {...field("task_type")}>{["学习", "工作", "阅读", "运动", "整理", "生活"].map((type) =>
            <option key={type}>{type}</option>)}
            {!["学习", "工作", "阅读", "运动", "整理", "生活"].includes(task.task_type) && <option>{task.task_type}</option>}
          </select></div>
      </fieldset>
      {conflicts.length > 0 && <p className="form-error" role="status">时间重叠：{conflicts.map((item) => item.name).join("、")}。可以调整时间或选择继续保存。</p>}
      {(error || state.error) && <p className="form-error" role="alert">{error || state.error}</p>}
      <div className="modal-actions"><button type="button" className="cancel-button" disabled={saving} onClick={close}>取消</button>
        <button className="save-button" disabled={saving || (uncertain && editing)}>{saving ? "正在保存…" : uncertain ? "重试原创建请求" : editing ? "保存修改" : initialTask ? "确认创建任务" : "创建任务"}</button></div>
    </form>
  </div>;
}

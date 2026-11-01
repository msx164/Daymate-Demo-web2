import { userStorage } from '../web2/session.js';
import { useState } from "react";
import { DEFAULT_FOCUS_MINUTES, readFocusMinutes, validFocusMinutes, writeFocusMinutes } from "../focusPreferences.js";

function preferredMinutes() {
  try { return readFocusMinutes(userStorage('local')); } catch { return DEFAULT_FOCUS_MINUTES; }
}

export function FocusSetup({ task, onStart, onClose, suggestedMinutes }) {
  const [minutes, setMinutes] = useState(()=>validFocusMinutes(suggestedMinutes)?Number(suggestedMinutes):preferredMinutes());
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    if (!validFocusMinutes(minutes)) {
      setError("请输入 1–240 之间的整数分钟数");
      return;
    }
    if (onStart(Number(minutes) * 60)) {
      try { writeFocusMinutes(userStorage('local'), minutes); } catch { /* Focus still works without storage. */ }
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="task-modal focus-setup" role="dialog" aria-modal="true"
        aria-labelledby="focus-setup-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="focus-setup-title">设置专注时长</h2>
            <p>{task.name}</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="focus-presets">
          {[15, 25, 45, 60].map((value) => (
            <button type="button" key={value} aria-pressed={Number(minutes) === value}
              className={Number(minutes) === value ? "selected" : ""}
              onClick={() => { setMinutes(value); setError(""); }}>{value} 分钟</button>
          ))}
        </div>
        <div className="form-group">
          <label htmlFor="focus-minutes">自定义时长（分钟）</label>
          <input id="focus-minutes" type="number" min="1" max="240" step="1" required
            value={minutes} onChange={(event) => { setMinutes(event.target.value); setError(""); }} autoFocus />
          <p className="form-hint">支持 1–240 分钟。休眠期间继续计时，手动暂停的时间不计入；达到目标后停止累计。</p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="cancel-button" onClick={onClose}>取消</button>
          <button type="submit" className="save-button">开始专注</button>
        </div>
      </form>
    </div>
  );
}

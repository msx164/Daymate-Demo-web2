import { CompanionAvatar } from "./CompanionAvatar.jsx";
import { companionState } from "../companionAppearance.js";
import { Live2DCompanion } from './Live2DCompanion.jsx';
import { ActivitySelector } from './ActivitySelector.jsx';
import {FocusCamera} from './FocusCamera.jsx';
import {useEffect,useRef,useState} from 'react';
import {companionBackgrounds} from '../companionBackgrounds.js';
import {resolveScene} from '../companionScenes.js';
export function FocusOverlay({ focus, onFinish, onDiscard, character, motion = false, live2d, activity = 'idle', activitySelection = 'idle', onActivityChange, propSettings,scene='day' }) {
  const [inquiryTarget,setInquiryTarget]=useState(null);
  const dialog=useRef(null);
  useEffect(()=>{dialog.current?.focus();},[]);
  const { focusTask, timeLeft, plannedSeconds, isSaving, pendingAction, isFocusing, recovered, saveError, storageWarning } = focus;
  const timer = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;
  const state = companionState({ hasFocus: true, isFocusing, isSaving, timeLeft });
  const experimental = import.meta.env.VITE_DAYMATE_LIVE2D === '1';
  const preview = experimental && live2d?.enabled && live2d.target === 'focus';
  return <div className="focus-overlay" style={{backgroundImage:`url(${companionBackgrounds[resolveScene(scene,activity)]})`}}><div className="focus-card" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="focus-title" tabIndex={-1}>
    <span className="focus-brand">DAYMATE <small>专注</small></span>
    <div className={`focus-avatar ${preview ? 'focus-live2d' : ''}`}>{preview
      ? <Live2DCompanion enabled character={character} state={state} motion={motion} activity={activity} propSettings={propSettings} />
      : <CompanionAvatar character={character} state={state} activity={activity} />}</div>
    <div className="focus-content"><h2 id="focus-title">把时间留给当下</h2>
    <p className="focus-task-name">{focusTask.name}</p><div className="focus-target">本次专注 · {plannedSeconds / 60} 分钟</div>
    <div className="focus-timer" aria-label={`剩余 ${timer}`}>{timer}</div>
    <p className="focus-message">{isSaving ? "正在保存本次专注…"
      : pendingAction !== null ? "待确认的记录已冻结，请重试原操作。"
      : timeLeft === 0 ? "专注已结束，请完成任务或保存退出。"
      : recovered ? "已恢复上次专注并暂停，离开页面的时间不计入。准备好后点击继续。"
      : isFocusing ? "我会陪你一起完成这个任务。" : "已经暂停，准备好后我们继续。"}</p>
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    {storageWarning && <p className="form-error" role="status">{storageWarning}</p>}
    <div className="focus-actions">
      <button disabled={isSaving || pendingAction !== null || timeLeft === 0} onClick={focus.togglePause}>{isFocusing ? "暂停" : "继续"}</button>
      <button className="complete-focus-button" disabled={isSaving || pendingAction === false} onClick={() => onFinish(true)}>
        {pendingAction === true ? "重试完成任务" : "完成任务"}</button>
      <button disabled={isSaving || pendingAction === true} onClick={() => onFinish(false)}>{pendingAction === false ? "重试保存退出" : "保存并退出"}</button>
    </div>
    </div>
    <details className="focus-more"><summary>更多</summary><div>
    {experimental && live2d?.available && <label className="focus-live2d-control"><input aria-label="专注弹窗 Live2D" type="checkbox" checked={live2d.enabled} onChange={live2d.toggle} />Live2D 陪伴</label>}
    {preview && onActivityChange && <ActivitySelector label="专注场景动作" value={activitySelection} onChange={onActivityChange} />}
    <button className="discard-focus" disabled={isSaving} onClick={onDiscard}>放弃本次专注</button>
    </div></details>
    <div className="session-alerts" ref={setInquiryTarget}/>
    <FocusCamera available={isFocusing&&!isSaving&&timeLeft>0&&pendingAction===null} activity={activity} inquiryTarget={inquiryTarget}/>
  </div></div>;
}

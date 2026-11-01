import { useEffect, useState } from "react";
import { CompanionAvatar } from "./CompanionAvatar.jsx";
import { COMPANION_STATES } from "../companionAppearance.js";
import { Live2DCompanion } from './Live2DCompanion.jsx';
import { ACTIVITIES, activityId } from '../companionActivities.js';
import "./PetWindow.css";
import {useLive2DDisplay} from '../hooks/useLive2DDisplay.js';

export function PetWindow() {
  const experimental = import.meta.env.VITE_DAYMATE_LIVE2D === '1';
  const [state, setState] = useState({ character: "day", motion: false, state: "idle" });
  const live2d=useLive2DDisplay(false,state.character);
  const [error, setError] = useState("");
  const bridge = window.daymatePet;
  useEffect(() => {
    let active = true, received = false;
    const unsubscribe = bridge.onState(value => { received = true; if (active) setState(value); });
    bridge.getState().then(value => { if (active && !received) setState(value); }, () => { if (active) setError("状态读取失败"); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  async function action(kind) {
    setError("");
    try { await (kind === "hide" ? bridge.hide() : bridge.openMain()); }
    catch { setError("操作未成功，请从托盘打开主界面。"); }
  }
  return <main className="pet-shell" data-state={state.state} data-character={state.character} data-motion={state.motion}>
    <div className="pet-handle" aria-label="拖动桌宠">Daymate · 拖动这里</div>
    <div className="pet-caption" role="status">{COMPANION_STATES[state.state]?.label || "陪伴中"}{state.activity && state.activity !== 'idle' ? ` · ${ACTIVITIES[activityId(state.activity)].label}` : ''}</div>
    <div className="pet-character">{experimental && live2d.enabled
      ? <Live2DCompanion enabled character={state.character} state={state.state} motion={state.motion} activity={state.activity} propSettings={state.propSettings} />
      : <CompanionAvatar character={state.character} state={state.state} motion={state.motion} activity={state.activity} />}</div>
    {experimental && <label className="pet-live2d-control"><input aria-label="桌宠 Live2D" type="checkbox" checked={live2d.enabled} disabled={!live2d.ready} onChange={live2d.toggle} />Live2D · {state.character==='custom'?'我的角色':'Day'}</label>}
    <div className="pet-actions"><button onClick={() => action("open")}>打开主页</button>
      <button onClick={() => action("hide")}>隐藏</button></div>
    {error && <p className="pet-error" role="alert">{error}</p>}
  </main>;
}

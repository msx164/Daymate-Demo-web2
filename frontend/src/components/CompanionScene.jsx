import dayRoom from "../assets/companion/study-day-v1.png";
import nightRoom from "../assets/companion/study-night-v1.png";
import kitchenRoom from '../assets/companion/kitchen-v1.png';
import loungeRoom from '../assets/companion/lounge-v1.png';
import {SCENES,resolveScene,ACTIVITY_COPY} from '../companionScenes.js';
import { COMPANION_STATES } from "../companionAppearance.js";
import { CompanionAvatar } from "./CompanionAvatar.jsx";
import { CharacterImport } from "./CharacterResources.jsx";
import { useCharacterResources } from "../hooks/useCharacterResources.js";
import { ActivitySelector } from './ActivitySelector.jsx';
import { ACTIVITIES } from '../companionActivities.js';
import { ActivityPropControls } from './ActivityPropControls.jsx';
import {Live2DWorkshop} from './Live2DWorkshop.jsx';
import {useState} from 'react';
import "./CompanionScene.css";

export function CompanionScene({ appearance, live2d, visible = true, state = "idle", activity = 'idle', activityProps, openTaskModal,compact=false,controlsOpen=false }) {
  const [readingPreview,setReadingPreview]=useState(false);
  const [preferencesOpen,setPreferencesOpen]=useState(false);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const experimental = import.meta.env.VITE_DAYMATE_LIVE2D === '1';
  const { settings, update, warning } = appearance;
  const resources = useCharacterResources();
  const current = COMPANION_STATES[state] || COMPANION_STATES.idle;
  const scene=resolveScene(settings.scene,activity),copy=ACTIVITY_COPY[activity]||ACTIVITY_COPY.idle;
  const backgrounds={day:dayRoom,night:nightRoom,kitchen:kitchenRoom,lounge:loungeRoom};
  return <section className="companion-scene" aria-labelledby="scene-title" data-state={state}
    data-scene={scene} data-motion={settings.motion} data-character={settings.character}>
    <div className="scene-surface">
      <img key={scene} className="scene-background" src={backgrounds[scene]} alt="" />
      <div className="scene-copy">
        <span className="scene-eyebrow">DAYMATE · 你的陪伴空间</span>
        <h2 id="scene-title">{compact?'今天，也有我陪你。':copy.title}</h2>
        <p>{compact?'做喜欢的事，或一起安静待一会儿。':copy.message}</p>
        <div className="scene-message" role="status"><span className="scene-state">{current.label}</span><p>{current.message}</p></div>
        <button className="primary-button" onClick={openTaskModal}>添加一个任务 →</button>
      </div>
      <div className="scene-character">{visible && !readingPreview && experimental && live2d?.enabled && live2d.target === 'home' ? <Live2DCompanion enabled character={settings.character} state={state} motion={settings.motion} activity={activity} propSettings={activityProps?.value} />
        : <CompanionAvatar character={settings.character} state={state} motion={settings.motion} activity={activity} />}</div>
      <span className="scene-caption">{SCENES[scene].label} · {ACTIVITIES[activity].label}</span>
    </div>
    <details className="scene-preferences" open={compact?controlsOpen:undefined} onToggle={event=>{if(event.target===event.currentTarget)setPreferencesOpen(event.currentTarget.open);}}>
    <summary>形象与场景</summary>
    <div className="scene-controls" role="group" aria-label="陪伴形象与场景">
      {experimental && live2d?.available && <label><input aria-label="启用实验性 Live2D" type="checkbox" checked={live2d.enabled} disabled={!live2d.ready} onChange={live2d.toggle} />{settings.character==='custom'?'我的角色':'Day'} · Live2D{!live2d.ready?'（请先生成模型）':''}</label>}
      <div className="scene-options"><span>场景</span>
        {Object.entries(SCENES).map(([id,info])=><button key={id} aria-pressed={settings.scene===id} onClick={()=>update({scene:id})}>{info.label}</button>)}</div>
      <label>形象 <select aria-label="陪伴形象" value={settings.character} onChange={event => update({ character: event.target.value })}>
        <option value="day">Day · 插画角色</option><option value="robot">经典机器人</option>
        <option value="custom" disabled={!resources.character}>{resources.character ? `自定义 · ${resources.character.name}` : '自定义角色（尚未导入）'}</option></select></label>
      <label className="scene-motion"><input type="checkbox" checked={settings.motion} onChange={event => update({ motion: event.target.checked })} />轻微动作</label>
      <ActivitySelector value={settings.activity} onChange={value => update({activity:value})} />
    </div>
    <p className="activity-description" role="status">{ACTIVITIES[activity].label} · {ACTIVITIES[activity].description}
      {!live2d?.enabled && settings.character==='day' && ['reading','working','cleaning','dishes'].includes(activity) && ' Day 场景形象。'}{!settings.motion && ' 动作已关闭，角色保持静态。'}</p>
    {experimental && live2d?.enabled && activityProps && <ActivityPropControls value={activityProps.value} onChange={activityProps.update} onReset={activityProps.reset} disabled={activity==='idle'} />}
    {activityProps?.warning && <p className="form-hint" role="status">{activityProps.warning}</p>}
    {warning && <p className="form-hint" role="status">{warning}</p>}
    {settings.character === 'custom' && !resources.loading && !resources.character && <p className="form-hint" role="status">自定义角色不可用，当前显示内置 Day。可重新导入或切换形象。</p>}
    <CharacterImport onSelect={() => update({ character: 'custom' })} onRemove={()=>{if(settings.character==='custom')update({character:'day'});}} />
    <details className="scene-advanced" onToggle={event=>{if(event.target===event.currentTarget)setAdvancedOpen(event.currentTarget.open);}}><summary>模型生成与高级选项</summary>
    <Live2DWorkshop onReadingPreviewChange={setReadingPreview} visible={visible&&advancedOpen&&(compact?controlsOpen:preferencesOpen)&&live2d?.target!=='focus'}/>
    </details></details>
  </section>;
}
import { Live2DCompanion } from './Live2DCompanion.jsx';

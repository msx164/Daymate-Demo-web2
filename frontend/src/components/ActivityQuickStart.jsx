import { ACTIVITY_PRESETS } from '../activityPresets.js';
import { ACTIVITIES } from '../companionActivities.js';
export function ActivityQuickStart({ onPrepare, disabled }) {
  return <section className="activity-quick-start"><div><h3>场景快捷开始</h3><p>先核对任务，再选择专注时长。准备草稿不会开始计时。</p></div>
    <div className="activity-preset-grid">{Object.entries(ACTIVITY_PRESETS).map(([id,preset])=><article key={id}>
      <strong>{ACTIVITIES[id].label}</strong><span>建议 {preset.minutes} 分钟</span>
      <button disabled={disabled} aria-label={`准备${ACTIVITIES[id].label}任务`} onClick={()=>onPrepare(id)}>准备任务 →</button>
    </article>)}</div></section>;
}

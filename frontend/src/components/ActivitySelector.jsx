import { ACTIVITIES, activitySelection } from '../companionActivities.js';
export function ActivitySelector({ value, onChange, label = '生活场景动作', automatic = true }) {
  return <label className="activity-selector">{label}<select aria-label={label} value={activitySelection(value)} onChange={event => onChange(event.target.value)}>
    {automatic && <option value="auto">自动跟随专注任务</option>}
    {Object.entries(ACTIVITIES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
  </select></label>;
}

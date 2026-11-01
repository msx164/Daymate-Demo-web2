import { ACTIVITIES } from '../companionActivities.js';

export function ActivityMotionBindings({ clips, enabled, onEnabled, bindings, onBinding }) {
  return <section className="activity-motion-bindings"><h4>生活场景原生动作映射</h4>
    <label><input type="checkbox" aria-label="启用场景原生动作映射" checked={enabled} disabled={!clips.length} onChange={event=>onEnabled(event.target.checked)} />切换场景时播放指定动作</label>
    <div className="activity-motion-grid">{Object.entries(ACTIVITIES).map(([id,info])=><label key={id}>{info.label}
      <select aria-label={`${info.label}原生动作映射`} value={bindings[id]||''} disabled={!clips.length} onChange={event=>onBinding(id,event.target.value)}>
        <option value="">使用现有场景动作</option>{clips.map(clip=><option key={clip.id} value={clip.id}>{clip.label}</option>)}
      </select></label>)}</div>
    <p className="form-hint">开启后，在模型就绪、切换场景或更改当前场景映射时播放一次；未配置、播放完成或失败后使用现有场景动作。手动播放、暂停或停止后，直到下次切换场景或修改当前映射才自动播放。配置仅在当前设置页有效，重新选择包会清空；动作内容由模型提供，请自行核对是否适合场景。</p>
  </section>;
}

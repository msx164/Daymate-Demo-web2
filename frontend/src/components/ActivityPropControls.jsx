import { propSettings } from '../activityProps.js';
export function ActivityPropControls({ value,onChange,onReset,prefix='生活',disabled=false }) {
  const props=propSettings(value);
  return <details className="activity-prop-controls"><summary>{prefix}道具调整</summary><fieldset disabled={disabled}>
    <label><input aria-label={`${prefix}显示道具`} type="checkbox" checked={props.visible} onChange={event=>onChange({visible:event.target.checked})} />显示场景道具</label>
    {[['x','水平偏移',-25,25,1],['y','垂直偏移',-25,25,1],['scale','大小',50,150,1]].map(([key,label,min,max,step])=><label key={key}>{label}
      <input aria-label={`${prefix}道具${label}`} type="range" min={min} max={max} step={step} value={key==='scale'?Math.round(props.scale*100):props[key]}
        onChange={event=>onChange({[key]:Number(event.target.value)/(key==='scale'?100:1)})}/><output>{key==='scale'?`${Math.round(props.scale*100)}%`:`${props[key]}%`}</output>
    </label>)}
    <button type="button" onClick={onReset}>重置{prefix}道具</button>
    <p>只调整道具，不改变人物姿态。偏移以人物高度为比例；大小围绕腰部缩放。</p>
  </fieldset>{disabled && <p>请先选择带道具的生活场景。</p>}</details>;
}

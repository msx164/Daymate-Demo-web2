import {useEffect,useRef,useState} from 'react';
import {CAMERA_REGIONS,cameraRegionPreset,normalizeCameraRegion} from '../cameraRegion.js';

export function ObjectObservationRegion({stream,region,onChange}){
  const [expanded,setExpanded]=useState(false),preview=useRef(null);
  const selected=cameraRegionPreset(region),label=CAMERA_REGIONS[selected]?.label||'自定义区域';
  useEffect(()=>{
    const element=preview.current;if(!element||!expanded)return;
    element.srcObject=stream;void element.play().catch(()=>{});
    return()=>{element.srcObject=null;};
  },[stream,expanded]);
  return <details className="object-region" onToggle={e=>setExpanded(e.currentTarget.open)}>
    <summary>物体观察区域：{label}</summary>
    {expanded&&<>
      <label>选择区域<select aria-label="物体观察区域" value={selected} onChange={e=>{const preset=CAMERA_REGIONS[e.target.value];if(preset)onChange(normalizeCameraRegion(preset));}}>{Object.entries(CAMERA_REGIONS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}<option value="custom" disabled>自定义（调整下方滑块）</option></select></label>
      <div className="object-region-preview"><video ref={preview} muted autoPlay playsInline aria-label="物体任务区域预览"/><div className="object-region-box" aria-hidden="true" style={{left:`${region.x*100}%`,top:`${region.y*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%`}}/></div>
      <p className="form-hint">预览未镜像，绿色框内才用于物体检测；在场和姿态观察仍使用完整画面。调整摄像头位置后，请重新选择区域。</p>
      <div className="object-region-fields">{Object.entries({x:'左边距',y:'上边距',width:'区域宽度',height:'区域高度'}).map(([key,title])=><label key={key}>{title} {Math.round(region[key]*100)}%<input aria-label={`物体观察${title}`} type="range" min={key==='x'||key==='y'?0:10} max={key==='x'||key==='y'?90:100} step="1" value={Math.round(region[key]*100)} onChange={e=>onChange(normalizeCameraRegion({...region,[key]:Number(e.target.value)/100}))}/></label>)}</div>
      <p className="form-hint">改变区域会清除旧线索并重新计算手机持续时间，提醒冷却继续保留。区域仅留在此页面，切换摄像头后请核对。</p>
    </>}
  </details>;
}

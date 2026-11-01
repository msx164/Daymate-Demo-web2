import {useState,useSyncExternalStore} from 'react';
import {TASK_OBJECTS} from '../objectObservation.js';
import {cameraCheckExport,cameraCheckSummary,cameraCheckThresholdGroups} from '../cameraObjectCheck.js';

export function CameraObjectCheck({check,context,ready}){
  const [label,setLabel]=useState('cell phone'),snapshot=useSyncExternalStore(check.subscribe,check.getSnapshot);
  const counts=cameraCheckSummary(snapshot.records),last=snapshot.records.at(-1),waiting=!!snapshot.pending;
  const groups=cameraCheckThresholdGroups(snapshot.records);
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(cameraCheckExport(snapshot.records),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`Daymate-camera-check-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <details className="camera-object-check" data-check={snapshot.status}>
    <summary>本机识别自检 · {snapshot.records.length} 次</summary>
    <p>先确认物体是否位于当前绿色选区内，再点击相应按钮，保持位置等待下一次新采样。请按实际画面填写。</p>
    <label>检查目标<select aria-label="自检目标物体" value={label} disabled={waiting} onChange={e=>setLabel(e.target.value)}>{Object.entries(TASK_OBJECTS).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
    <div className="camera-check-actions"><button disabled={!ready||waiting} onClick={()=>check.begin(label,true,context)}>选区内有{TASK_OBJECTS[label]}，检查下一帧</button><button disabled={!ready||waiting} onClick={()=>check.begin(label,false,context)}>选区内无{TASK_OBJECTS[label]}，检查下一帧</button>{waiting&&<button onClick={()=>check.cancel()}>取消本次检查</button>}</div>
    {!ready&&<p className="form-hint">请先开启摄像头、坐定观察与物体线索，等待有效检测结果。</p>}
    <p role="status">{({idle:'尚未开始本页自检。',waiting:'请保持当前物体位置，正在等待点击后的新采样…',timeout:'未等到有效的新采样，本次不计入记录。请检查摄像头和区域后重试。',cancelled:'本次检查已取消，没有新增记录。',interrupted:'观察已暂停、画面不可用或设置已改变，本次检查已取消。',done:last?`${last.expected===last.detected?'本次一致':last.expected?'本次漏检':'本次误检'}：你确认选区内${last.expected?'有':'无'}${TASK_OBJECTS[last.label]}，模型${last.detected?'检出':'未检出'}。`:''})[snapshot.status]}</p>
    {snapshot.status==='done'&&last?.expected&&!last.detected&&<p className="form-hint">请检查物体大小、遮挡、光线和选区后重试；在当前位置，相关手机询问可能漏报。</p>}
    {snapshot.status==='done'&&last&&!last.expected&&last.detected&&<p className="form-hint">请核对选区是否包含其他相似物体，再调整区域后重试。</p>}
    <p>本页最近 30 次：检出且一致 {counts.matched}，漏检 {counts.missed}，误检 {counts.falsePositive}，未检出且一致 {counts.correctAbsence}。这些是你主动确认的样本，不代表实际识别准确率或专注率。</p>
    {snapshot.records.length>0&&<><table className="camera-check-thresholds"><caption>按识别阈值查看本页检查</caption><thead><tr><th>档位／阈值</th><th>次数</th><th>漏检</th><th>误检</th></tr></thead><tbody>{groups.map(group=><tr key={group.threshold}><td>{group.label} {group.threshold.toFixed(2)}</td><td>{group.total}</td><td>{group.missed}</td><td>{group.falsePositive}</td></tr>)}</tbody></table><ul>{snapshot.records.slice(-5).reverse().map(record=><li key={record.id}>{new Date(record.checkedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})} · {TASK_OBJECTS[record.label]} · 阈值 {(record.threshold??.55).toFixed(2)} · 确认{record.expected?'有':'无'}，模型{record.detected?'检出':'未检出'}{record.score!==null?`（分数 ${record.score.toFixed(2)}）`:''}</li>)}</ul><button onClick={download}>导出无图像自检 JSON</button><button onClick={()=>check.clear()}>清空本页自检记录</button></>}
    <p className="form-hint">只保留目标类别、你的确认、模型结果、检查时间、视频尺寸和区域坐标；不保存图片或设备标识，不写数据库、不上传。离开此页面后清除，导出文件由你主动保存。自检不调整模型、提醒规则或专注统计。</p>
  </details>;
}

import {useSyncExternalStore} from 'react';
import {CAMERA_DIAGNOSTIC_KINDS,cameraTimingSummary} from '../cameraDiagnostics.js';

function timingText(value){return value?`平均 ${Math.round(value.average)} ms / 最长 ${Math.round(value.max)} ms`:'尚无有效返回';}
export function CameraDiagnostics({diagnostics}){
  const snapshot=useSyncExternalStore(diagnostics.subscribe,diagnostics.getSnapshot);
  return <details className="camera-diagnostics">
    <summary>本机观察运行情况</summary>
    <p>卡顿时可比较各路耗时，关闭暂时不用的观察。完整处理包含取帧、排队、模型推理及结果传回；采样间隔不计入耗时。这些数值不表示 CPU、内存占用或识别准确率。</p>
    <div className="camera-diagnostics-grid">{Object.entries(CAMERA_DIAGNOSTIC_KINDS).map(([kind,label])=>{
      const value=snapshot[kind],model=cameraTimingSummary(value.timings,'durationMs'),total=cameraTimingSummary(value.timings,'elapsedMs');
      return <section key={kind} data-diagnostics-kind={kind} data-active={value.active} data-ready={value.ready} data-frames={value.frames} data-results={value.results} data-discarded={value.discarded} data-failures={value.failures}>
        <h4>{label}</h4><p>{value.active?value.ready?'运行中':'加载中':'已停止'} · 启动 {value.starts} 次</p>
        <p>本页采样 {value.frames} 次，返回 {value.results} 次，其中有效 {value.accepted} 次、过期／中断丢弃 {value.discarded} 次；故障停止 {value.failures} 次。</p>
        <p>最近 {value.timings.length} 次返回的模型耗时：{timingText(model)}</p>
        <p>完整处理耗时：{timingText(total)}</p>
      </section>;
    })}</div>
    <p className="form-hint">每路只保留最近 30 次有效格式返回的耗时，包含因过期或中断而丢弃的返回；冻结／未就绪时没有新采样，失败或仍在处理的采样没有返回。暂停、重试后本页累计保留，离开页面清除。不保存画面、类别或设备标识，不写数据库、不上传。</p>
  </details>;
}

const labels={idle:'尚未播放',loading:'正在检查动作…',playing:'播放中',paused:'已暂停',stopped:'已停止，恢复场景动作',finished:'播放完成，恢复场景动作',error:'动作无法播放，模型仍可使用；请检查文件格式与预算。'};
export function NativeMotionControls({clips,selected,onSelect,status,ready,onCommand,staticMode}) {
  return <section className="native-motion-controls"><h4>模型包原生动作</h4>
    {clips.length ? <><label>动作<select aria-label="模型包原生动作" value={selected} onChange={event=>onSelect(event.target.value)}>{clips.map(clip=><option key={clip.id} value={clip.id}>{clip.label}</option>)}</select></label>
      <div className="diagnostic-actions"><button disabled={!ready || status==='loading'} onClick={()=>onCommand('play',selected)}>播放原生动作</button>
        <button disabled={!ready || status!=='playing'} onClick={()=>onCommand('pause')}>暂停原生动作</button>
        <button disabled={!ready || status!=='paused'} onClick={()=>onCommand('resume')}>继续原生动作</button>
        <button disabled={!ready || !['loading','playing','paused'].includes(status)} onClick={()=>onCommand('stop')}>停止原生动作</button></div>
    </> : <p>此模型清单未声明动作。</p>}
    <p className="native-motion-status" role="status">{labels[status]||labels.idle}{ready&&staticMode&&status==='playing'?'；当前暂停／静态设置使进度冻结。':''}</p>
    <p className="form-hint">仅播放一次，不播放音频或事件。播放时优先使用原生动作，停止后恢复生活场景；通用动作不代表扫地、洗碗等专用绑定。</p>
  </section>;
}

import {useEffect,useId,useRef,useState} from 'react';
import {READING_RIG_DRAFT} from '../readingRigDraft.js';
import atlas from '../assets/companion/reading-rig/day-reading-atlas-v2.png';
import {drawReadingAssembly} from '../readingRigAssembly.js';
import reference from '../assets/companion/day-reading-v1.png';
import './ReadingRigDraft.css';
import {ReadingMotionPreview} from './ReadingMotionPreview.jsx';

function AssemblyPreview(){
  const canvas=useRef(null),[error,setError]=useState(false);
  useEffect(()=>{
    let active=true;const image=new Image();
    image.onload=()=>{if(active){drawReadingAssembly(canvas.current.getContext('2d'),image);canvas.current.dataset.ready='true';}};
    image.onerror=()=>{if(active)setError(true);};image.src=atlas;
    return()=>{active=false;image.onload=null;image.onerror=null;};
  },[]);
  return error?<p role="alert">装配素材无法读取，请重新展开检查。</p>:<canvas ref={canvas} width="1024" height="1536" aria-label="Day 阅读静态装配候选" data-ready="false"/>;
}

export function ReadingRigDraft({onPreviewChange,visible=true}){
  const [open,setOpen]=useState(false),[selected,setSelected]=useState('all'),[background,setBackground]=useState('checker');
  const [motionPreview,setMotionPreview]=useState(false);
  useEffect(()=>()=>onPreviewChange?.(false),[onPreviewChange]);
  const clip=useId();
  const layer=READING_RIG_DRAFT.layers.find(value=>value.id===selected);
  const bounds=layer?.rect||[0,0,1536,1024];
  return <details className="reading-rig-draft" onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open){setMotionPreview(false);onPreviewChange?.(false);}}} data-status="needs_review">
    <summary>阅读动作素材检查（制作中）</summary>
    {open&&<>
      <p>这是原版 Day 的阅读制作候选，尚未完成精细 Live2D 绑定。不会替换当前角色。先检查手、书和袖口，再制作动作。</p>
      <div className="reading-rig-options"><label>检查部件<select aria-label="阅读素材部件" value={selected} onChange={event=>setSelected(event.target.value)}><option value="all">全部拆件</option><option value="assembly">持书装配候选（静态）</option><option value="reference">原版阅读立绘</option>{READING_RIG_DRAFT.layers.map(value=><option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
        <label>检查背景<select aria-label="阅读素材背景" value={background} onChange={event=>setBackground(event.target.value)}><option value="checker">透明棋盘</option><option value="light">浅色</option><option value="dark">深色</option></select></label></div>
      <div className="reading-rig-surface" data-background={background}>
        {selected==='assembly'?<AssemblyPreview/>:selected==='reference'?<img src={reference} alt="原版男性 Day 阅读立绘参考"/>:<svg viewBox={bounds.join(' ')} role="img" aria-label={layer?`阅读拆件：${layer.label}`:'Day 阅读拆件候选总览'}><defs><clipPath id={clip}><rect x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]}/></clipPath></defs><g clipPath={`url(#${clip})`}><image href={atlas} width="1536" height="1024"/></g></svg>}
      </div>
      <p role="status">{selected==='assembly'?'六层持书姿态试装：前景手部与前臂共享变换；仍需检查肩部接合和手指与书的遮挡，不是翻页动画。':layer?.review||'候选状态：待精修。前臂、书、翻页已分离；掌指、书页和袖口接合尚未通过装配验收。'}</p>
      <p className="form-hint">素材检查不会开启摄像头、麦克风或自动生成模型。此处没有“应用”按钮，避免把待精修拆件当作完成的动画。</p>
      <label><input aria-label="打开阅读 Live2D 动作预览" type="checkbox" checked={motionPreview} disabled={import.meta.env.VITE_DAYMATE_LIVE2D!=='1'} onChange={event=>{setMotionPreview(event.target.checked);onPreviewChange?.(event.target.checked);}}/>打开阅读 Live2D 动作预览</label>
      {motionPreview&&<p className="form-hint">主场景暂时显示插画，关闭此预览后恢复。进入专注或隐藏页面会释放预览；返回后需点击播放。</p>}
      {motionPreview&&<ReadingMotionPreview visible={visible}/>}
    </>}
  </details>;
}

import {useEffect,useState} from 'react';
import {useCharacterResources} from '../hooks/useCharacterResources.js';
import {ReadingRigDraft} from './ReadingRigDraft.jsx';
const labels={missing:'待生成',unavailable:'本机生成工具未准备好',building:'正在本机生成…',compiled:'基础 Live2D 已生成',failed:'生成失败'};
export function Live2DWorkshop({onReadingPreviewChange,visible=true}){
  const bridge=window.daymateDesktop,resources=useCharacterResources();
  const [models,setModels]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(!bridge?.getLive2DStatus)return;
    let alive=true,received=false;const accept=value=>{if(alive)setModels(value||{});};
    const off=bridge.onLive2DChanged?.(value=>{received=true;accept(value);});
    bridge.getLive2DStatus().then(value=>{if(!received)accept(value);},()=>{if(alive)setMessage('生成状态暂时无法读取。');});
    return()=>{alive=false;off?.();};
  },[bridge,resources.character?.id]);
  async function generate(kind){
    if(busy)return;setBusy(true);setMessage('正在本机生成网格、绑定和模型，请稍等。');
    try{const result=await bridge.generateLive2D(kind);setMessage(result.failure||'模型已生成，可在陪伴页启用 Live2D；显示失败时会恢复原图片。');}
    catch{setMessage('生成未完成，原图片和已有模型保留。');}
    finally{setBusy(false);}
  }
  return <section className="live2d-workshop"><h3>图片生成 Live2D</h3>
    <p>使用原版男性 Day，或上传自己的角色图片。图片在本机生成与保存，不发送到模型服务。</p>
    <p className="form-hint">当前为单图基础绑定，可进行整体呼吸和轻微转向。独立眨眼、口型与手部动作需要进一步分层制作。</p>
    {bridge?.generateLive2D?<>
      <div className="diagnostic-actions"><span>Day 原版男生 · {labels[models.day?.state]||'读取中…'}</span><button disabled={busy||models.day?.state==='unavailable'} onClick={()=>generate('day')}>生成 Day Live2D</button></div>
      <div className="diagnostic-actions"><span>{resources.character?.name||'请先上传角色图片'} · {labels[models.custom?.state]||'待生成'}</span><button disabled={busy||!resources.character||models.custom?.state==='unavailable'} onClick={()=>generate('custom')}>为上传图片生成 Live2D</button></div>
    </>:<p className="form-hint">本机自动生成在 Windows 源码 Demo 中提供。</p>}
    {message&&<p className="form-hint" role="status">{message}</p>}
    <ReadingRigDraft onPreviewChange={onReadingPreviewChange} visible={visible}/>
  </section>;
}

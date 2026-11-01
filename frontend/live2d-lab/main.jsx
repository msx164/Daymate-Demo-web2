import {StrictMode,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {checkModel,checkSDK,directoryFiles} from '../src/live2dPreflight.js';
import day from '../src/assets/companion/day-v1.png';
import './style.css';
export function Lab(){
  const [sdk,setSDK]=useState(null),[model,setModel]=useState(null),[checking,setChecking]=useState(false),[gpu,setGPU]=useState('');
  const revision=useRef(0);
  useEffect(()=>()=>{revision.current++;},[]);
  async function select(kind,list){
    if(!list.length)return;
    const id=++revision.current;setChecking(true);
    try{
      const files=directoryFiles([...list]),result=kind==='sdk'?checkSDK(files):await checkModel(files);
      if(id===revision.current)(kind==='sdk'?setSDK:setModel)(result);
    }catch{if(id===revision.current)(kind==='sdk'?setSDK:setModel)({ok:false,message:'资源无法检查，请选择有效的单独资源目录。'});}
    finally{if(id===revision.current)setChecking(false);}
  }
  function inspectGPU(){
    const context=document.createElement('canvas').getContext('webgl',{alpha:true});
    setGPU(context?'WebGL 可创建。':'WebGL 不可用，请使用图片形象。');context?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return <main><header><span>DAYMATE · 开发工具</span><h1>Live2D 资源准备检查</h1><p>目录仅在本机检查。人物生成和播放请使用 Daymate 陪伴页。</p></header>
    <div className="lab-grid"><section><h2>检查资源</h2>
      <label>官方 Cubism SDK 目录<input aria-label="选择 SDK 目录" type="file" webkitdirectory="" multiple disabled={checking} onChange={event=>void select('sdk',event.target.files)}/></label>
      <p role="status">{sdk?.message||'尚未选择 SDK。'}</p>
      <label>模型目录<input aria-label="选择模型目录" type="file" webkitdirectory="" multiple disabled={checking} onChange={event=>void select('model',event.target.files)}/></label>
      <p role="status">{checking?'正在检查…':model?.message||'尚未选择模型。'}</p>
      <button onClick={inspectGPU}>检测 WebGL</button><p role="status">{gpu}</p>
    </section><section><h2>男性 Day 与自定义角色</h2><div className="checker"><img src={day} alt="原版男性 Day"/></div>
      <p>启动 Daymate，进入陪伴页，上传 PNG 后选择“为上传图片生成 Live2D”。原版 Day 可直接选择“Day · Live2D”。</p>
      <p>当前生成基础网格绑定；独立眨眼、口型和精细肢体动作需要分层制作。</p>
    </section></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Lab/></StrictMode>);

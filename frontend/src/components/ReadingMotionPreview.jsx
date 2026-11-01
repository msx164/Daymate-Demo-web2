import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPreviewSession} from '../live2dSession.js';
import {loadReadingMotion} from '../readingMotionPackage.js';
import {useWindowVisibility} from '../hooks/useWindowVisibility.js';

function Player({files,clip}){
  const frame=useRef(null),session=useRef(null),[ready,setReady]=useState(false),[phase,setPhase]=useState('idle'),[error,setError]=useState(''),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useLayoutEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const connection=createPreviewSession({host:window,child:frame.current.contentWindow,onReady:()=>setReady(true),onError:()=>setError('阅读模型加载失败，请关闭后重试。'),onNativeMotion:value=>setPhase(value.phase)});
    session.current=connection;
    const sync=()=>{setReduced(media.matches);if(media.matches)connection.requestMotion('stop');connection.update({state:'idle',activity:'idle',motion:true,reduced:media.matches,propSettings:{visible:false}});};
    sync();media.addEventListener('change',sync);
    return()=>{session.current=null;media.removeEventListener('change',sync);connection.dispose();};
  },[]);
  return <section className="reading-motion-player" aria-label="阅读 Live2D 动作预览" data-phase={phase} data-ready={ready}>
    {!error&&<iframe ref={frame} title="Day 阅读翻页 Live2D" src="/__live2d/sdk-preview/#package" sandbox="allow-scripts allow-same-origin" onLoad={()=>frame.current?.contentWindow.postMessage({type:'daymate-package-load',files:[...files]},location.origin)}/>}
    <div className="reading-motion-actions"><button disabled={!ready||!!error||reduced||phase==='loading'} onClick={()=>session.current?.requestMotion('play',clip)}>播放阅读与翻页（18 秒）</button><button disabled={!ready||!['playing','paused'].includes(phase)||reduced} onClick={()=>session.current?.requestMotion(phase==='paused'?'resume':'pause')}>{phase==='paused'?'继续动作':'暂停动作'}</button><button disabled={!ready} onClick={()=>session.current?.requestMotion('stop')}>停止并回到持书姿态</button></div>
    <p role="status">{error||({idle:ready?'模型已加载，点击播放后才开始动作。':'正在加载阅读模型…',loading:'正在准备动作…',playing:'正在阅读；约第 13 秒开始翻页。',paused:'动作已暂停。',stopped:'已停止，恢复持书姿态。',finished:'本段动作完成，可重新播放。',error:'动作播放失败，请关闭后重试。'})[phase]}</p>
    {reduced&&<p>已遵循系统“减少动态效果”，保持静态。</p>}
    <p className="form-hint">使用八层 Cubism 模型和实际关键形，保留男性 Day。手臂目前为小幅同步转动，手腕与书页独立控制；肩部、指尖接触和连续表情仍待精修。</p>
  </section>;
}
function ResourceLoader(){
  const [resource,setResource]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const abort=new AbortController();void loadReadingMotion({signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setResource(value);}).catch(value=>{if(!abort.signal.aborted)setError(value.message);});return()=>abort.abort();},[]);
  return error?<p role="alert">{error}</p>:resource?<Player {...resource}/>:<p role="status">正在核对本机阅读模型指纹…</p>;
}
export function ReadingMotionPreview({visible=true}){
  const windowVisible=useWindowVisibility();
  return visible&&windowVisible?<ResourceLoader/>:<p role="status">预览已释放，返回可见页面后可重新播放。</p>;
}

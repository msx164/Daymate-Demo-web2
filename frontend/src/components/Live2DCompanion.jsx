import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPreviewSession } from '../live2dSession.js';
import { CompanionAvatar } from './CompanionAvatar.jsx';
import { useWindowVisibility } from '../hooks/useWindowVisibility.js';
import { checkLive2DPackage } from '../live2dPackage.js';

function Preview({ state, motion, activity, character, failed, propSettings,files }) {
  const frame = useRef(null), session = useRef(null), latest = useRef({ state, motion, activity, propSettings });
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = createPreviewSession({ host: window, child: frame.current.contentWindow,
      onReady: () => setReady(true), onError: failed });
    session.current = connection;
    const sync = () => connection.update({ ...latest.current, reduced: media.matches });
    media.addEventListener('change', sync); sync();
    return () => { session.current = null; media.removeEventListener('change', sync); connection.dispose(); };
  }, [failed]);
  useEffect(() => { latest.current = { state, motion, activity, propSettings }; session.current?.update({ state, motion, activity, propSettings, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }); }, [state, motion, activity, propSettings]);
  return <>
    {!ready && <CompanionAvatar character={character} state={state} motion={false} activity={activity} />}
    <iframe ref={frame} className="home-live2d" style={{ opacity: ready ? 1 : 0 }} title="实验性 Live2D 陪伴角色"
      src="/__live2d/sdk-preview/#package" sandbox="allow-scripts allow-same-origin" onError={() => session.current?.fail()}
      onLoad={()=>frame.current?.contentWindow.postMessage({type:'daymate-package-load',files:[...files]},location.origin)} />
  </>;
}

function GeneratedCompanion({ character, state, motion, activity, propSettings }) {
  const [error, setError] = useState(false);
  const [files,setFiles]=useState(null);
  const fail = useCallback(() => setError(true), []);
  useEffect(()=>{
    let active=true;
    const bridge=window.daymateDesktop||window.daymatePet;
    async function load(){
      try{
        const result=await bridge?.getLive2DModel?.(character);
        if(result?.state!=='compiled'||!Array.isArray(result.files)||result.files.length>128)throw Error();
        const map=new Map(result.files.map(([name,bytes])=>[name,new File([bytes],name)]));
        if(!(await checkLive2DPackage(map)).ok)throw Error();
        if(active)setFiles(map);
      }catch{if(active)setError(true);}
    }
    void load();return()=>{active=false;};
  },[character]);
  return <div className="home-live2d-slot" data-preview={!error ? 'active' : 'png'}>
    {!error && files ? <Preview files={files} character={character} state={state} motion={motion} activity={activity} propSettings={propSettings} failed={fail} />
      : <CompanionAvatar character={character} state={state} motion={motion} activity={activity} />}
    {error && <span className="live2d-warning" role="status">角色预览不可用，已恢复原形象。关闭后可重新启用。</span>}
  </div>;
}
export function Live2DCompanion({enabled,character,state,motion,activity='idle',propSettings}){
  const visible=useWindowVisibility();
  return enabled&&visible?<GeneratedCompanion key={character} character={character} state={state} motion={motion} activity={activity} propSettings={propSettings}/>
    :<div className="home-live2d-slot" data-preview="png"><CompanionAvatar character={character} state={state} motion={motion} activity={activity}/></div>;
}

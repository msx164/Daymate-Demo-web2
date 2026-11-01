import { useEffect,useState } from 'react';

export function useLive2DDisplay(hasFocus,character='day') {
  const available = import.meta.env.VITE_DAYMATE_LIVE2D === '1';
  const [selected, setSelected] = useState(false),[models,setModels]=useState({});
  useEffect(()=>{
    const bridge=window.daymateDesktop||window.daymatePet;if(!bridge?.getLive2DStatus)return;
    let active=true,received=false;const accept=value=>{if(active)setModels(value||{});};
    const unsubscribe=bridge.onLive2DChanged?.(value=>{received=true;accept(value);});
    bridge.getLive2DStatus().then(value=>{if(!received)accept(value);},()=>{});
    return()=>{active=false;unsubscribe?.();};
  },[]);
  const ready=character!=='robot'&&models[character]?.state==='compiled';
  const enabled = available && selected && ready;
  return { available, enabled, ready, target: hasFocus ? 'focus' : 'home',
    toggle: () => setSelected(value => !value) };
}

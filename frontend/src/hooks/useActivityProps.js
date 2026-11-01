import { userStorage } from '../web2/session.js';
import { useEffect,useMemo,useRef,useState } from 'react';
import { propSettings,readPropProfiles,writePropProfiles,validPropSettings } from '../activityProps.js';
function storage(){try{return userStorage('local');}catch{return null;}}
export function useActivityProps(activity) {
  const [view,setView]=useState(()=>readPropProfiles(storage()));
  const revision=useRef(0),alive=useRef(true);
  useEffect(()=>{
    alive.current=true;const current=revision.current;
    window.daymateDesktop?.getPropProfiles?.().then(result=>{
      if(alive.current&&revision.current===current){
        const value=readPropProfiles({getItem:()=>JSON.stringify({version:1,profiles:result.profiles})});
        setView({...value,warning:result.warning||value.warning});
      }
    }).catch(()=>{if(alive.current&&revision.current===current)setView(value=>({...value,warning:'桌面道具设置不可用，请完整退出并重启新版 Demo。'}));});
    return()=>{alive.current=false;};
  },[]);
  const value=useMemo(()=>propSettings(view.profiles[activity]),[view.profiles,activity]);
  function update(patch) {
    const next={...value,...patch};if(!validPropSettings(next))return;
    const profiles={...view.profiles,[activity]:propSettings(next)};setView({profiles,warning:writePropProfiles(storage(),profiles)});saveDesktop(propSettings(next));
  }
  function saveDesktop(value){
    const current=++revision.current;
    window.daymateDesktop?.savePropProfile?.(activity,value).then(result=>{if(alive.current&&revision.current===current&&result.warning)setView(previous=>({...previous,warning:result.warning}));})
      .catch(()=>{if(alive.current&&revision.current===current)setView(previous=>({...previous,warning:'桌面道具设置未能保存，请重启新版 Demo 后重试。'}));});
  }
  function reset(){const profiles={...view.profiles};delete profiles[activity];setView({profiles,warning:writePropProfiles(storage(),profiles)});saveDesktop(null);}
  return {value,update,reset,warning:view.warning};
}

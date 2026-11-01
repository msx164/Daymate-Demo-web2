import { stateParameters } from './live2dState.js';

export function createPresentationMotion() {
  let elapsed=0,lastNow=null,scene=null,current=null;
  return {
    resetClock(){lastNow=null;},
    adopt(values){
      // Only procedural channels participate in a transition back from native playback.
      // Model-specific channels must return to their saved defaults after stop.
      if(current)for(const [id,value] of Object.entries(values))if(Object.hasOwn(current,id))current[id]=value;
    },
    sample({now,animated,state,activity}) {
      const dt=lastNow===null?0:Math.max(0,Math.min(.08,(now-lastNow)/1000));lastNow=now;
      const changed=scene!==activity;
      if(changed){scene=activity;elapsed=0;}
      else if(animated)elapsed+=dt;
      const target=stateParameters(state,elapsed,animated,activity);
      if(!current||(!animated&&changed))current={...target};
      else if(animated){
        const alpha=1-Math.exp(-dt/.22);
        for(const [id,value] of Object.entries(target)){
          const weight=['ParamEyeLOpen','ParamEyeROpen'].includes(id)?1-Math.exp(-dt/.025):alpha;
          current[id]=(current[id]??value)+(value-(current[id]??value))*weight;
        }
      }
      return {parameters:{...current},seconds:elapsed};
    },
  };
}

import { prepareMotion,nativeMotionRequest } from './live2dMotions.js';
export function createNativePlayer({read,getModel,getPose,schedule,onStatus,createMotion,createManager,parameterIndex}) {
  let clips=[],manager=null,phase='idle',id='',elapsed=0,duration=0,sequence=0,closed=false,skipDelta=true,baseline=null,parameterNames=[];
  const report=()=>({phase,id,elapsed,duration,instances:manager?1:0});
  const notify=()=>onStatus(report());
  function restore() {
    const model=getModel();if(!model || !baseline)return;
    model.loadParameters();getPose()?.reset(model);
    baseline.parts.forEach((value,index)=>model.setPartOpacityByIndex(index,value));model.setModelOapcity(baseline.opacity);baseline=null;
  }
  function clear(){sequence++;manager?.release();manager=null;restore();parameterNames=[];skipDelta=true;}
  return {
    configure(value){clips=value;},diagnostics:report,
    resetClock(){skipDelta=true;},isPaused:()=>phase==='paused',
    async control(action,selected) {
      const request=nativeMotionRequest(action,selected);if(closed || !request)return;
      if(action==='stop'){clear();phase='stopped';elapsed=0;notify();schedule();return;}
      if(action==='pause'&&phase==='playing'){phase='paused';skipDelta=true;notify();schedule();return;}
      if(action==='resume'&&phase==='paused'){phase='playing';skipDelta=true;notify();schedule();return;}
      if(action!=='play')return;
      clear();id=selected;phase='loading';elapsed=0;duration=0;notify();schedule();const current=sequence;
      try {
        const clip=clips[Number(selected)];if(!clip || !getModel())throw Error('Motion unavailable');
        const bytes=await (await read(clip.file)).arrayBuffer();
        if(closed || current!==sequence)return;
        const prepared=prepareMotion(bytes),model=getModel();
        const motion=createMotion(prepared.buffer);
        if(!motion)throw Error('Motion rejected');
        motion.setLoop(false);motion.setFadeInTime(.15);motion.setFadeOutTime(.15);
        baseline={parts:Array.from({length:model.getPartCount()},(_,i)=>model.getPartOpacityByIndex(i)),opacity:model.getModelOapcity()};
        manager=createManager();manager.startMotionPriority(motion,true,1);parameterNames=prepared.parameters;
        duration=prepared.duration;phase='playing';skipDelta=true;notify();schedule();
      }catch{if(!closed && current===sequence){clear();phase='error';notify();schedule();}}
    },
    tick(delta,advance) {
      if(!manager)return null;
      const dt=advance&&phase==='playing'&&!skipDelta?Math.min(.1,Math.max(0,delta)):0;skipDelta=false;
      try {
        elapsed=Math.min(duration,elapsed+dt);manager.updateMotion(getModel(),dt);
        const applied={};
        for(const name of parameterNames){const model=getModel(),index=parameterIndex(model,name);if(index>=0 && index<model.getParameterCount())applied[name]=model.getParameterValueByIndex(index);}
        if(manager.isFinished()){clear();phase='finished';elapsed=duration;notify();schedule();}
        return applied;
      }catch{clear();phase='error';notify();schedule();return null;}
    },
    dispose(){if(closed)return;clear();closed=true;phase='disposed';},
  };
}

// Compare rotations, not identity or cognitive attention. Transposition does not
// change the relative angle, so this also avoids row/column-major ambiguity.
export function rotationFromMatrix(matrix) {
  const d=matrix?.data;
  if(!d||d.length!==16)return null;
  const r=[d[0],d[1],d[2],d[4],d[5],d[6],d[8],d[9],d[10]];
  if(!r.every(Number.isFinite))return null;
  for(let i=0;i<3;i++)for(let j=i;j<3;j++){
    const dot=r[i*3]*r[j*3]+r[i*3+1]*r[j*3+1]+r[i*3+2]*r[j*3+2];
    if(Math.abs(dot-(i===j?1:0))>.08)return null;
  }
  return r;
}
export function rotationDistance(a,b) {
  return Math.acos(Math.max(-1,Math.min(1,(a.reduce((sum,v,i)=>sum+v*b[i],0)-1)/2)))*180/Math.PI;
}
export const POSTURE_PROFILES=Object.freeze({
  sensitive:{label:'敏感',enter:18,exit:12},
  standard:{label:'标准',enter:25,exit:18},
  relaxed:{label:'宽松',enter:40,exit:30},
});
export function createTaskPosturePolicy({absentMs=15000,cooldownMs=120000,profile='standard'}={}) {
  let thresholds=POSTURE_PROFILES[profile]||POSTURE_PROFILES.standard;
  let zones={},collect=null,last=null,since=null,outside=false,lastReminder=-Infinity;
  function reset(){collect=null;last=null;since=null;outside=false;}
  return {
    reset,
    configure(options={}){
      if(Number.isFinite(options.absentMs)&&options.absentMs>=1000)absentMs=options.absentMs;
      thresholds=POSTURE_PROFILES[options.profile]||thresholds;
      // Settings changes clear only the pending deviation, retaining calibration
      // and the reminder cooldown. No model reload is needed.
      since=null;outside=false;
    },
    remove(slot){delete zones[slot];reset();return Object.keys(zones);},
    calibrate(slot,now){if(!['screen','book'].includes(slot))return;collect={slot,start:now,samples:[]};since=null;outside=false;},
    correct(now){since=null;outside=false;lastReminder=now;},
    observe(rotation,count,now){
      if(collect&&Number.isFinite(now)&&now<collect.start)return{state:'calibrating',samples:collect.samples.length,zones:Object.keys(zones),remind:false};
      const gap=last!==null&&(now<last||now-last>3000);last=now;
      if(!Number.isFinite(now)||gap||count!==1||!rotation){since=null;outside=false;collect=null;return{state:'unknown',remind:false,zones:Object.keys(zones)};}
      if(collect){
        if(now-collect.start>12000){collect=null;return{state:'calibration-failed',zones:Object.keys(zones)};}
        if(collect.samples.length&&rotationDistance(collect.samples[0],rotation)>8)collect.samples=[];
        collect.samples.push(rotation.slice());
        if(collect.samples.length>=6){
          zones[collect.slot]=collect.samples[0];collect=null;
          return{state:'aligned',zones:Object.keys(zones),remind:false};
        }
        return{state:'calibrating',samples:collect.samples.length,zones:Object.keys(zones),remind:false};
      }
      const entries=Object.values(zones);
      if(!entries.length)return{state:'uncalibrated',zones:[],remind:false};
      const degrees=Math.min(...entries.map(zone=>rotationDistance(zone,rotation)));
      outside=degrees>(outside?thresholds.exit:thresholds.enter);
      if(!outside){since=null;return{state:'aligned',zones:Object.keys(zones),degrees,remind:false};}
      if(since===null)since=now;
      const remind=now-since>=absentMs&&now-lastReminder>=cooldownMs;
      if(remind)lastReminder=now;
      return{state:'deviating',zones:Object.keys(zones),degrees,seconds:Math.floor((now-since)/1000),remind};
    },
  };
}

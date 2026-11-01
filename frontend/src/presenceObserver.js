export function createPresencePolicy({absentMs=15000,cooldownMs=120000,reminders=true}={}) {
  let missing=null,lastTime=null,lastReminder=-Infinity;
  return {
    reset(){missing=null;lastTime=null;},
    correct(now){missing=null;lastReminder=now;},
    observe(count,now){
      if(!Number.isFinite(now)||!Number.isInteger(count)||count<0||lastTime!==null&&(now<lastTime||now-lastTime>3000)){missing=null;lastTime=now;return{state:'unknown',remind:false};}
      lastTime=now;
      if(count!==0){missing=null;return{state:count===1?'present':'multiple',remind:false};}
      if(missing===null)missing=now;
      const duration=now-missing,remind=reminders&&duration>=absentMs&&now-lastReminder>=cooldownMs;
      if(remind)lastReminder=now;
      return{state:'no-face',seconds:Math.floor(duration/1000),remind};
    },
  };
}

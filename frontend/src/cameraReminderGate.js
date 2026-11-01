// Panel-local arbitration. Denied requests are never queued for later replay.
export function createCameraReminderGate({cooldownMs=120000,clock=()=>performance.now()}={}){
  let last=-Infinity,sequence=0,snapshot={active:null,snoozed:false};
  const listeners=new Set();
  function publish(value){snapshot=value;for(const listener of [...listeners])listener();}
  function snooze(){
    const now=clock();if(!Number.isFinite(now))return false;
    last=Math.max(last,now);publish({active:null,snoozed:true});return true;
  }
  return{
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>snapshot,
    request(owner,kind){
      const now=clock();
      if(!owner||!['presence','posture','objects'].includes(kind)||!Number.isFinite(now)||now-last<cooldownMs)return null;
      last=now;const ticket=++sequence;publish({active:{owner,kind,ticket},snoozed:false});return ticket;
    },
    dismiss(owner){if(snapshot.active?.owner===owner)publish({...snapshot,active:null});},
    correct(owner,ticket){
      if(!snapshot.active||snapshot.active.owner!==owner||snapshot.active.ticket!==ticket)return false;
      return snooze();
    },
    snooze,
  };
}

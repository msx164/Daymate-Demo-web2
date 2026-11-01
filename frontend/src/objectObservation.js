export const TASK_OBJECTS=Object.freeze({'cell phone':'手机',book:'书本',laptop:'笔记本电脑'});
export const OBJECT_SCORE_PROFILES=Object.freeze({sensitive:{label:'灵敏',threshold:.4},standard:{label:'标准',threshold:.55},conservative:{label:'保守',threshold:.75}});
export function objectThreshold(value){return Object.values(OBJECT_SCORE_PROFILES).some(item=>item.threshold===value)?value:.55;}
export function objectEvidence(value,threshold=.55){
  if(!Array.isArray(value)||value.length>10)return null;
  threshold=objectThreshold(threshold);
  const scores={};
  for(const item of value){
    if(!item||!Object.hasOwn(TASK_OBJECTS,item.label)||!Number.isFinite(item.score)||item.score<threshold||item.score>1)continue;
    scores[item.label]=Math.max(scores[item.label]||0,item.score);
  }
  return Object.entries(scores).map(([label,score])=>({label,score}));
}
export function createObjectObservationPolicy({phoneReminders=false,absentMs=15000,cooldownMs=120000,threshold=.55}={}){
  threshold=objectThreshold(threshold);
  let since=null,last=null,hits=0,lastReminder=-Infinity;
  const reset=()=>{since=null;last=null;hits=0;};
  return{
    reset,
    configure(options){phoneReminders=options.phoneReminders===true;if(Number.isFinite(options.absentMs)&&options.absentMs>=1000)absentMs=options.absentMs;if(Object.hasOwn(options,'threshold'))threshold=objectThreshold(options.threshold);reset();},
    correct(now){reset();lastReminder=now;},
    observe(value,now){
      const objects=objectEvidence(value,threshold),gap=last!==null&&(now<=last||now-last>3000);last=now;
      if(!objects||!Number.isFinite(now)||gap){since=null;hits=0;return{state:'unknown',objects:[],remind:false};}
      const phone=objects.some(item=>item.label==='cell phone');
      if(!phone||!phoneReminders){since=null;hits=0;return{state:'observing',objects,remind:false};}
      if(since===null)since=now;
      hits++;
      const remind=hits>=3&&now-since>=absentMs&&now-lastReminder>=cooldownMs;
      if(remind)lastReminder=now;
      return{state:'phone-visible',objects,seconds:Math.floor((now-since)/1000),remind};
    },
  };
}

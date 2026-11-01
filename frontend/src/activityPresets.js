export const ACTIVITY_PRESETS = Object.freeze({
  reading: { name:'阅读一本书', type:'阅读', minutes:25 },
  working: { name:'完成一项工作', type:'工作', minutes:45 },
  cleaning: { name:'打扫房间', type:'整理', minutes:15 },
  dishes: { name:'清洗餐具', type:'生活', minutes:10 },
  stretching: { name:'肩颈伸展', type:'运动', minutes:5 },
  resting: { name:'休息放松', type:'生活', minutes:10 },
});
export function activityDraft(activity, now = new Date()) {
  if(typeof activity!=='string' || !Object.hasOwn(ACTIVITY_PRESETS,activity))throw Error('请选择生活场景。');
  const preset=ACTIVITY_PRESETS[activity];
  const local=new Date(now.getTime()+8*3600000);
  if(!Number.isFinite(local.getTime())) throw Error('当前时间无效。');
  const start=Math.min(1438,local.getUTCHours()*60+local.getUTCMinutes()),end=Math.min(1439,start+preset.minutes);
  const time=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  return {activity,minutes:preset.minutes,task:{name:preset.name,task_type:preset.type,task_date:local.toISOString().slice(0,10),start_time:time(start),end_time:time(end)}};
}

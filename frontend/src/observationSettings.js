import {activityId,ACTIVITIES} from './companionActivities.js';

export function observationSettings(activity,mode='auto',seconds=15){
  const id=activityId(activity);
  const selected=['auto','desk','mobile'].includes(mode)?mode:'auto';
  const mobile=selected==='mobile'||selected==='auto'&&['cleaning','dishes','stretching','resting'].includes(id);
  const delay=[15,30,60,120].includes(Number(seconds))?Number(seconds):15;
  return {activity:id,label:ACTIVITIES[id].label,profile:mobile?'mobile':'desk',absentMs:delay*1000,reminders:!mobile};
}

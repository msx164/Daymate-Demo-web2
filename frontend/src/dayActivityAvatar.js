import {activityId} from './companionActivities.js';
export function dayActivityResource({character,state,activity,images,failed=[]}) {
  const id=activityId(activity);
  if(character!=='day'||['thinking','speaking','ended'].includes(state)||!images[id]||failed.includes(images[id]))return null;
  return {pose:`activity-${id}`,activity:id,src:images[id],source:'builtin',name:'Day'};
}

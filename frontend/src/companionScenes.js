export const SCENES=Object.freeze({day:{label:'日光书房'},night:{label:'夜间书房'},kitchen:{label:'暖光厨房'},lounge:{label:'休憩客厅'},auto:{label:'跟随活动'}});
export function sceneId(value){return typeof value==='string'&&Object.hasOwn(SCENES,value)?value:'day';}
export function resolveScene(selection,activity){
  const scene=sceneId(selection);
  if(scene!=='auto')return scene;
  return activity==='dishes'?'kitchen':['cleaning','stretching','resting'].includes(activity)?'lounge':'day';
}
export const ACTIVITY_COPY=Object.freeze({
  idle:{title:'今天，也一起慢慢向前。',message:'把大目标拆成小小的一步。学习、工作，或是好好休息，都有自己的节奏。'},
  reading:{title:'读到下一页，也是一种进步。',message:'留一点安静的时间。读几行，想一想，不必急着翻页。'},
  working:{title:'先完成眼前这一件事。',message:'把待办放在一旁，一次只处理一个小目标。需要时，停下来理清思路。'},
  cleaning:{title:'从一小块空间开始。',message:'整理桌面，清扫地面。让房间一点点清爽，也给自己一点余裕。'},
  dishes:{title:'一起收拾好这一餐。',message:'洗净餐具，擦好台面。用一件简单的小事，为生活收个尾。'},
  stretching:{title:'给肩颈一个轻松的间隙。',message:'按舒服的幅度缓慢活动，保持呼吸。不勉强身体，也不赶进度。'},
  resting:{title:'现在，可以慢下来。',message:'放松肩膀，看一会儿窗外。休息也是今天值得留出的时间。'},
});

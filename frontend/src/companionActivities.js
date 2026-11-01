import { activityRhythm } from './activityRhythm.js';
export const ACTIVITIES = Object.freeze({
  idle: { label: '日常陪伴', description: '轻轻呼吸，陪你安排今天。' },
  reading: { label: '看书', description: '一起读几页，慢慢进入状态。' },
  working: { label: '工作', description: '打开电脑，专心处理眼前的一件事。' },
  cleaning: { label: '打扫卫生', description: '从一小块空间开始，一起收拾干净。' },
  dishes: { label: '洗碗', description: '洗净一只碗，也给生活留一点清爽。' },
  stretching: { label: '伸展', description: '轻轻活动肩臂，按自己的节奏来。' },
  resting: { label: '休息', description: '放松一下，准备好后再出发。' },
});
export function activityId(value) { return typeof value === 'string' && Object.hasOwn(ACTIVITIES, value) ? value : 'idle'; }
export function activitySelection(value) { return value === 'auto' ? value : activityId(value); }
export function taskActivity(task) {
  if (!task) return 'idle';
  const text = `${String(task.task_type || '').slice(0,100)} ${String(task.name || '').slice(0,200)}`;
  for (const [kind, pattern] of [
    ['dishes', /洗碗|刷碗|洗盘|刷盘|餐具|dish/i], ['cleaning', /打扫|扫地|拖地|清洁|卫生|整理房|clean/i],
    ['stretching', /伸展|拉伸|运动|锻炼|stretch|exercise/i], ['resting', /休息|放松|小憩|rest/i],
    ['reading', /看书|读书|阅读|学习|复习|read|study/i], ['working', /工作|办公|编程|代码|写作|work|code/i],
  ]) if (pattern.test(text)) return kind;
  return 'idle';
}
export function resolveActivity(selection, task) { return selection === 'auto' ? taskActivity(task) : activityId(selection); }

// Procedural gestures use standard parameter IDs. Missing bindings are ignored by each generated model.
export function activityParameters(activity, seconds, animated) {
  activity = activityId(activity);
  const t = animated && Number.isFinite(seconds) ? seconds : 0;
  const {sweep:wave,slow,keys:typing,scan,turn,wash,washY}=activityRhythm(t,animated);
  switch (activity) {
    case 'reading': return { ParamAngleX: scan * 1.8, ParamAngleY: -11+turn*2, ParamAngleZ: -2,
      ParamEyeBallX: scan * .23, ParamEyeBallY: -.4+turn*.12, ParamBodyAngleX: slow * .35,
      ParamArmLA: -.12, ParamArmRA: -.12+turn*.22, ParamHandAngleL: -.12, ParamHandAngleR: .12-turn*.18 };
    case 'working': return { ParamAngleX: slow * 1.7, ParamAngleY: -7, ParamEyeBallX: scan * .15, ParamEyeBallY: -.25,
      ParamBodyAngleX: slow * .35, ParamArmLA: -.15 + typing * .065, ParamArmRA: -.15 - typing * .065,
      ParamHandAngleL: -.12 + typing * .1, ParamHandAngleR: .12 - typing * .1 };
    case 'cleaning': return { ParamAngleX: wave * 4, ParamAngleY: -6, ParamAngleZ: wave * 1.5,
      ParamBodyAngleX: wave * 2.5, ParamBodyAngleZ: wave * 1.4,
      ParamArmLA: .12 + wave * .23, ParamArmRA: .12 - wave * .23, ParamHandAngleR: wave * .22 };
    case 'dishes': return { ParamAngleX: wash * 1.7, ParamAngleY: -12, ParamEyeBallY: -.45, ParamBodyAngleX: wash * .5,
      ParamArmLA: -.12 + wash * .1, ParamArmRA: -.12 + washY * .1,
      ParamHandAngleL: wash * .2, ParamHandAngleR: washY * .2 };
    case 'stretching': return { ParamAngleX: slow * 5, ParamAngleY: 5, ParamAngleZ: slow * 5,
      ParamBodyAngleX: slow * 2.5, ParamBodyAngleZ: slow * 3,
      ParamArmLA: .55 + slow * .15, ParamArmRA: .55 - slow * .15, ParamHandAngleL: -.2, ParamHandAngleR: .2 };
    case 'resting': return { ParamAngleX: -5, ParamAngleY: -3, ParamAngleZ: 7 + slow * 2,
      ParamEyeLOpen: .65, ParamEyeROpen: .65, ParamBodyAngleX: slow * .4 };
    default: return {};
  }
}

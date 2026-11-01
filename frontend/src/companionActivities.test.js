import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, activityId, resolveActivity, activityParameters } from './companionActivities.js';
import { animatedState, stateParameters } from './live2dState.js';
import { APPEARANCE_KEY, readAppearance, writeAppearance } from './companionAppearance.js';
test('task following resolves locally with explicit overrides and safe unknown fallback', () => {
  for(const [name,expected] of [['打扫卫生','cleaning'],['洗碗','dishes'],['看书','reading'],['处理工作邮件','working'],['拉伸十分钟','stretching'],['休息一下','resting']])
    assert.equal(resolveActivity('auto',{name}),expected);
  assert.equal(resolveActivity('working',{name:'洗碗'}),'working');
  assert.equal(resolveActivity('auto',null),'idle'); assert.equal(resolveActivity('auto',{name:'未分类任务'}),'idle');
  for(const value of ['<script>','__proto__',null,{},['reading']]) assert.equal(activityId(value),'idle');
});
test('activity gestures are distinct, finite and stop varying for paused, saving, disabled or reduced motion', () => {
  const poses=[];
  for(const activity of Object.keys(ACTIVITIES)) {
    const first=activityParameters(activity,0,true),second=activityParameters(activity,1,true);
    assert.ok(Object.values(first).every(Number.isFinite)); assert.ok(Object.values(second).every(Number.isFinite));
    assert.deepEqual(activityParameters(activity,0,false),activityParameters(activity,999,false)); poses.push(JSON.stringify(first));
    for(const [state,enabled,reduced] of [['paused',true,false],['saving',true,false],['idle',false,false],['focus',true,true]]) {
      const animate=animatedState(state,enabled,reduced);
      assert.deepEqual(stateParameters(state,0,animate,activity),stateParameters(state,999,animate,activity));
    }
  }
  assert.equal(new Set(poses).size,poses.length);
  assert.notDeepEqual(activityParameters('working',0,true),activityParameters('working',.2,true));
  assert.ok(stateParameters('idle',0,false,'reading').ParamEyeBallY<0);
});
test('legacy appearance gains idle activity while new selections persist without unrelated private fields', () => {
  const data=new Map([[APPEARANCE_KEY,JSON.stringify({version:1,settings:{scene:'day',character:'day',motion:true}})]]);
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert.equal(readAppearance(storage).settings.activity,'idle');
  const settings={...readAppearance(storage).settings,activity:'auto',task:'private'};
  assert.equal(writeAppearance(storage,settings),''); assert.equal(readAppearance(storage).settings.activity,'auto');
  assert.ok(!data.get(APPEARANCE_KEY).includes('private'));
});

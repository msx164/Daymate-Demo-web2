import test from 'node:test';import assert from 'node:assert/strict';
import {activityDraft,ACTIVITY_PRESETS} from './activityPresets.js';
test('all presets create editable valid task drafts with independent suggested focus minutes',()=>{
  for(const id of Object.keys(ACTIVITY_PRESETS)){
    const draft=activityDraft(id,new Date('2026-10-18T01:05:00Z'));
    assert.equal(draft.task.task_date,'2026-10-18');assert.equal(draft.task.start_time,'09:05');assert.ok(draft.task.end_time>draft.task.start_time);
    assert.ok(draft.minutes>=1&&draft.minutes<=240);assert.deepEqual(Object.keys(draft.task).sort(),['end_time','name','start_time','task_date','task_type']);
  }
});
test('China midnight drafts never wrap end time into the past and reject unknown activities',()=>{
  const d=activityDraft('working',new Date('2026-10-18T15:59:59Z'));assert.equal(d.task.start_time,'23:58');assert.equal(d.task.end_time,'23:59');assert.equal(d.minutes,45);
  assert.equal(activityDraft('reading',new Date('2026-10-18T16:00:00Z')).task.task_date,'2026-10-19');
  for(const id of ['unknown','__proto__',{}])assert.throws(()=>activityDraft(id));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {addObservationFeedback,observationFeedbackSummary} from './observationFeedback.js';
test('only explicit known reasons and click times are retained',()=>{
  const initial=[];
  assert.equal(addObservationFeedback(initial,'automatic-distraction'),initial);
  assert.equal(addObservationFeedback(initial,'task',NaN),initial);
  assert.deepEqual(addObservationFeedback(initial,'reading',1000),[{reason:'reading',time:1000}]);
  assert.deepEqual(initial,[]);
});
test('feedback is bounded to the most recent fifty reports',()=>{
  let entries=[];for(let i=0;i<70;i++)entries=addObservationFeedback(entries,'task',i);
  assert.equal(entries.length,50);assert.equal(entries[0].time,20);
});
test('user reports count separately from a task completion or attention score',()=>{
  let entries=[];for(const reason of ['reading','screens','task','break'])entries=addObservationFeedback(entries,reason,0);
  assert.deepEqual(observationFeedbackSummary(entries),{counts:{reading:1,screens:1,task:1,break:1},total:4,unnecessary:3});
  assert.equal(observationFeedbackSummary([]).total,0);
});

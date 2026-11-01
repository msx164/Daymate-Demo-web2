export const OBSERVATION_FEEDBACK_REASONS=Object.freeze({
  reading:'正在看书或写字',
  screens:'正在看另一个屏幕',
  task:'仍在任务中',
  break:'确实需要休息',
});
// Explicit user reports only. No automatic accuracy score, image or landmarks.
export function addObservationFeedback(entries,reason,now=Date.now()) {
  if(!Object.hasOwn(OBSERVATION_FEEDBACK_REASONS,reason)||!Number.isFinite(now))return entries;
  return [...entries,{reason,time:now}].slice(-50);
}
export function observationFeedbackSummary(entries) {
  const counts={reading:0,screens:0,task:0,break:0};
  for(const entry of entries)if(Object.hasOwn(counts,entry.reason))counts[entry.reason]++;
  return {counts,total:Object.values(counts).reduce((a,b)=>a+b,0),unnecessary:counts.reading+counts.screens+counts.task};
}

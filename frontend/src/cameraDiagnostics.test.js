import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraDiagnostics,cameraTimingSummary} from './cameraDiagnostics.js';

test('concurrent sessions and retry retain totals without double stopping or stale writes',()=>{
  const store=createCameraDiagnostics(),first=store.open('objects'),face=store.open('face');
  first.ready();first.ready();first.frame();first.result({durationMs:40,elapsedMs:70,accepted:true});
  first.stop(true);first.stop(true);first.frame();first.ready();first.result({durationMs:1,elapsedMs:1,accepted:true});
  const retry=store.open('objects');retry.ready();retry.frame();retry.result({durationMs:50,elapsedMs:3101,accepted:false});
  const value=store.getSnapshot().objects;
  assert.deepEqual({...value,timings:undefined},{active:1,ready:1,starts:2,frames:2,results:2,accepted:1,discarded:1,failures:1,timings:undefined});
  assert.equal(store.getSnapshot().face.active,1);assert.equal(store.getSnapshot().face.ready,0);
  retry.stop();face.stop();assert.equal(store.getSnapshot().objects.active,0);assert.equal(store.getSnapshot().objects.ready,0);assert.equal(store.getSnapshot().face.active,0);
});

test('timing window remains bounded, aggregates recent values and drops payload fields',()=>{
  const store=createCameraDiagnostics(),session=store.open('face');
  for(let i=0;i<45;i++){session.frame();session.result({durationMs:i,elapsedMs:i+20,accepted:i%2===0,objects:['private'],deviceId:'private'});}
  const value=store.getSnapshot().face;
  assert.equal(value.results,45);assert.equal(value.timings.length,30);assert.deepEqual(value.timings[0],{durationMs:15,elapsedMs:35});
  assert.deepEqual(cameraTimingSummary(value.timings,'durationMs'),{count:30,average:29.5,max:44});
  assert.deepEqual(cameraTimingSummary(value.timings,'elapsedMs'),{count:30,average:49.5,max:64});
  assert.equal(cameraTimingSummary([],'durationMs'),null);assert.equal(JSON.stringify(store.getSnapshot()).includes('private'),false);
  session.stop();
});

test('invalid kinds and timings cannot contaminate diagnostics; subscribers see stable snapshots',()=>{
  const store=createCameraDiagnostics();let calls=0;
  const original=store.getSnapshot(),unsubscribe=store.subscribe(()=>calls++);
  assert.equal(store.open('unknown'),null);assert.equal(store.getSnapshot(),original);
  const session=store.open('posture'),opened=store.getSnapshot();
  for(const values of [{durationMs:NaN,elapsedMs:10,accepted:true},{durationMs:1,elapsedMs:-1,accepted:true},{durationMs:1,elapsedMs:Infinity,accepted:true},{durationMs:1,elapsedMs:2,accepted:'yes'}])session.result(values);
  assert.equal(store.getSnapshot(),opened);assert.equal(calls,1);
  session.ready();assert.equal(original.posture.active,0);assert.equal(opened.posture.ready,0);
  unsubscribe();session.stop();assert.equal(calls,2);
});

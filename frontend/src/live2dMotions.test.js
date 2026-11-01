import test from 'node:test';import assert from 'node:assert/strict';
import {motionClips,prepareMotion,nativeMotionRequest} from './live2dMotions.js';
const motion=()=>({Version:3,Meta:{Duration:1,Fps:30,CurveCount:1,TotalSegmentCount:1,TotalPointCount:2,UserDataCount:1},Curves:[{Target:'Parameter',Id:'ParamAngleX',Segments:[0,-10,0,1,10]}],UserData:[{Time:0,Value:'never execute'}]});
const encode=value=>new TextEncoder().encode(JSON.stringify(value)).buffer;
test('motion list only uses declared relative files with stable bounded IDs',()=>{
  assert.deepEqual(motionClips({FileReferences:{Motions:{Idle:[{File:'motions/a.motion3.json',Sound:'a.wav'}]}}},'model/A.model3.json'),[{id:'0',label:'Idle · 1',file:'model/motions/a.motion3.json'}]);
  assert.throws(()=>motionClips({FileReferences:{Motions:{Idle:[{File:'../x.motion3.json'}]}}},'A.model3.json'));
  assert.throws(()=>motionClips({FileReferences:{Motions:{Idle:Array.from({length:65},()=>({File:'a.motion3.json'}))}}},'A.model3.json'));
});
test('motion sanitizer validates counts and strips events, callbacks, loop and unrelated metadata',()=>{
  const value=motion();value.callback='private';value.Meta.Loop=true;
  const result=prepareMotion(encode(value)),parsed=JSON.parse(new TextDecoder().decode(result.buffer));
  assert.equal(parsed.Meta.Loop,false);assert.equal(parsed.Meta.UserDataCount,0);assert.equal(parsed.UserData,undefined);assert.equal(parsed.callback,undefined);assert.equal(result.duration,1);
});
test('malformed, oversized, non-monotonic or excessive motion curves are rejected',()=>{
  for(const edit of [v=>{v.Meta.Duration=1000;},v=>{v.Curves[0].Segments=[0,0,9,1,1];},v=>{v.Curves[0].Segments=[0,0,0,-1,1];},v=>{v.Curves[0].Segments=[0,0,0,0,1];},v=>{v.Meta.TotalPointCount=8;},v=>{v.Curves[0].Segments=[0,0,1,1,1];}]){
    const value=motion();edit(value);assert.throws(()=>prepareMotion(encode(value)));
  }
  assert.throws(()=>prepareMotion(new ArrayBuffer(1024*1024+1)));
  assert.equal(nativeMotionRequest('play','../x'),null);assert.equal(nativeMotionRequest('play','64'),null);assert.equal(nativeMotionRequest('eval','0'),null);
  assert.deepEqual(nativeMotionRequest('stop','private'),{action:'stop'});
});

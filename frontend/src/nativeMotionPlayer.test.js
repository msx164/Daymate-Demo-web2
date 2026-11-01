import test from 'node:test';import assert from 'node:assert/strict';
import { createNativePlayer } from './nativeMotionPlayer.js';
const buffer=()=>new TextEncoder().encode(JSON.stringify({Version:3,Meta:{Duration:1,Fps:30,CurveCount:1,TotalSegmentCount:1,TotalPointCount:2},Curves:[{Target:'Parameter',Id:'ParamAngleX',Segments:[0,0,0,1,10]}]})).buffer;
function fixture(read=async()=>({arrayBuffer:async()=>buffer()}),failTick=false) {
  let created=0,released=0,poseResets=0;
  const model={angle:0,parts:[1,0],opacity:1,loadParameters(){this.angle=0;},getPartCount:()=>2,getPartOpacityByIndex(i){return this.parts[i];},
    setPartOpacityByIndex(i,v){this.parts[i]=v;},getModelOapcity(){return this.opacity;},setModelOapcity(v){this.opacity=v;},getParameterCount:()=>1,getParameterValueByIndex(){return this.angle;}};
  const player=createNativePlayer({read,getModel:()=>model,getPose:()=>({reset(){poseResets++;}}),schedule(){},onStatus(){},parameterIndex:()=>0,
    createMotion(){created++;return {setLoop(){},setFadeInTime(){},setFadeOutTime(){},release(){if(!this.closed){released++;this.closed=true;}}};},
    createManager(){return {time:0,startMotionPriority(m){this.motion=m;},release(){this.motion?.release();},isFinished(){return this.time>=1;},updateMotion(m,dt){if(failTick)throw Error('SDK fixture failure');this.time+=dt;m.angle=this.time*10;}};}});
  player.configure([{id:'0',file:'a.motion3.json'}]);return {player,model,counts:()=>({created,released,poseResets})};
}
test('native motion freezes, resumes without catch-up and restores part/opacity baseline on stop',async()=>{
  const f=fixture();await f.player.control('play','0');f.player.tick(.5,true);f.player.tick(.1,true);assert.equal(f.player.diagnostics().elapsed,.1);
  await f.player.control('pause');f.player.tick(100,true);assert.equal(f.player.diagnostics().elapsed,.1);
  await f.player.control('resume');f.player.tick(100,true);assert.equal(f.player.diagnostics().elapsed,.1);f.player.tick(.1,true);assert.equal(f.player.diagnostics().elapsed,.2);
  f.model.parts=[.3,.7];f.model.opacity=.2;await f.player.control('stop');assert.deepEqual(f.model.parts,[1,0]);assert.equal(f.model.opacity,1);assert.equal(f.player.diagnostics().instances,0);
  assert.deepEqual(f.counts(),{created:1,released:1,poseResets:1});f.player.dispose();assert.equal(f.counts().released,1);
});
test('late file completion after stop or teardown never allocates a motion',async()=>{
  for(const dispose of [false,true]){
    let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.player.control('play','0');
    if(dispose)f.player.dispose();else await f.player.control('stop');finish({arrayBuffer:async()=>buffer()});await pending;assert.equal(f.counts().created,0);assert.equal(f.player.diagnostics().instances,0);
  }
});
test('invalid motion data reports a local error and keeps model usable',async()=>{
  const f=fixture(async()=>({arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}));await f.player.control('play','0');
  assert.equal(f.player.diagnostics().phase,'error');assert.equal(f.player.diagnostics().instances,0);assert.equal(f.counts().created,0);assert.equal(f.model.opacity,1);
});
test('a motion evaluation error releases only the player and restores model state',async()=>{
  const f=fixture(undefined,true);await f.player.control('play','0');assert.equal(f.player.tick(.1,true),null);
  assert.equal(f.player.diagnostics().phase,'error');assert.equal(f.player.diagnostics().instances,0);assert.equal(f.model.opacity,1);assert.equal(f.counts().released,1);
});

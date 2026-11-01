import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPauseDetector, rms, watchVoicePause} from './voiceEndpoint.js';
test('volume measurement tolerates silent and invalid samples',()=>{
  assert.equal(rms([]),0);assert.equal(rms([NaN,0]),0);assert.equal(rms([-.5,.5]),.5);
});
test('initial silence and short clicks never count as an utterance',()=>{
  const detect=createPauseDetector();let result;
  for(let time=0;time<=8000;time+=50)result=detect(time%1000===0?.1:0,time);
  assert.equal(result.state,'empty');assert.equal(detect(.1,8050).state,'done');
});
test('sustained sound followed by pause ends once; short pauses do not end',()=>{
  const detect=createPauseDetector();
  for(let time=0;time<=500;time+=50)detect(.1,time);
  assert.equal(detect(0,550).state,'pause');assert.equal(detect(0,1000).state,'pause');
  assert.equal(detect(.1,1050).state,'sound');
  for(let time=1100;time<2450;time+=50)assert.equal(detect(0,time).state,'pause');
  assert.equal(detect(0,2450).state,'end');assert.equal(detect(0,2500).state,'done');
});
test('sensitivity changes threshold; long sampling gaps cannot imply a valid pause',()=>{
  const sensitive=createPauseDetector({threshold:.008}),conservative=createPauseDetector({threshold:.035});
  for(let time=0;time<=500;time+=50){sensitive(.012,time);conservative(.012,time);}
  assert.equal(sensitive(0,550).state,'pause');assert.equal(conservative(0,550).state,'waiting');
  assert.equal(sensitive(0,2000).state,'interrupted');
});
function monitorFixture(options={}){
  let callback,level=0,closed=0,disconnected=0,resume;
  const context={close:async()=>{closed++;},createMediaStreamSource:()=>({connect(){},disconnect(){disconnected++;}}),
    createAnalyser:()=>({fftSize:2048,disconnect(){disconnected++;},getFloatTimeDomainData:array=>array.fill(level)}),resume:()=>new Promise(resolve=>{resume=resolve;})};
  const events=[];
  const monitor=watchVoicePause({}, {onState:event=>events.push(event.state),onEnd:()=>events.push('end'),onEmpty:()=>events.push('empty'),onError:()=>events.push('error'),...options},
    {createContext:()=>context,requestFrame:fn=>{callback=fn;return 1;},cancelFrame:()=>{callback=null;}});
  return {monitor,events,resume:async()=>{resume();await Promise.resolve();},sample(time,next){level=next;callback?.(time);},stats:()=>({closed,disconnected,scheduled:!!callback})};
}
test('audio nodes close on detected endpoint and never connect to a speaker',async()=>{
  const fixture=monitorFixture();await fixture.resume();
  for(let time=0;time<=500;time+=50)fixture.sample(time,.1);
  for(let time=550;time<=1900;time+=50)fixture.sample(time,0);
  assert.equal(fixture.events.at(-1),'end');assert.deepEqual(fixture.stats(),{closed:1,disconnected:2,scheduled:false});
  fixture.monitor.stop();assert.equal(fixture.stats().closed,1);
});
test('cancel before AudioContext resume prevents a late monitoring loop',async()=>{
  const fixture=monitorFixture();fixture.monitor.stop();await fixture.resume();
  assert.deepEqual(fixture.stats(),{closed:1,disconnected:2,scheduled:false});assert.deepEqual(fixture.events,[]);
});

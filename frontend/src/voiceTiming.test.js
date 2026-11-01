import test from 'node:test';
import assert from 'node:assert/strict';
import { readVoiceTiming, saveVoiceTiming, voiceTiming } from './voiceTiming.js';
import { createPauseDetector } from './voiceEndpoint.js';

test('voice timing defaults safely and persists only known explicit choices',()=>{
  let value=null;const storage={getItem:()=>value,setItem:(_key,next)=>{value=next;}};
  assert.equal(readVoiceTiming(storage),'normal');
  assert.equal(saveVoiceTiming(storage,'fast'),true);assert.equal(readVoiceTiming(storage),'fast');
  assert.equal(saveVoiceTiming(storage,'unknown'),false);
  value='__proto__';assert.equal(readVoiceTiming(storage),'normal');
  assert.equal(voiceTiming('__proto__'),voiceTiming('normal'));
  assert.equal(readVoiceTiming({getItem(){throw Error();}}),'normal');
  assert.equal(saveVoiceTiming({setItem(){throw Error();}},'fast'),false);
});

test('fast and relaxed pauses have different cutoffs but both require sustained sound',()=>{
  for(const [mode,cutoff] of [['fast',800],['normal',1400],['relaxed',2000]]){
    const detect=createPauseDetector({silenceMs:voiceTiming(mode).silenceMs});
    for(let time=0;time<=500;time+=50)detect(.1,time);
    for(let time=550;time<500+cutoff;time+=50)assert.equal(detect(0,time).state,'pause');
    assert.equal(detect(0,500+cutoff).state,'end');assert.equal(detect(0,550+cutoff).state,'done');
    const silent=createPauseDetector({silenceMs:voiceTiming(mode).silenceMs});
    let value;for(let time=0;time<=8000;time+=50)value=silent(0,time);
    assert.equal(value.state,'empty');
  }
});

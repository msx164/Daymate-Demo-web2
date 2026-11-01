import {test} from 'node:test';import assert from 'node:assert/strict';import {createDuplexSegment} from './duplexCapture.js';
test('duplex prebuffer keeps opening syllables and emits one bounded PCM utterance',()=>{
  let triggered=0,result;const segment=createDuplexSegment({onSpeech:()=>triggered++,onPCM:pcm=>{result=pcm;},onError:()=>assert.fail()});
  for(let i=0;i<20;i++)segment.push(new Float32Array(1024));
  for(let i=0;i<12;i++)segment.push(new Float32Array(1024).fill(.1));
  for(let i=0;i<30;i++)segment.push(new Float32Array(1024));
  assert.equal(triggered,1);assert.ok(result.byteLength>32000&&result.byteLength<=960000);assert.ok(new Int16Array(result.buffer).some(value=>value>0));
});
test('cancelled duplex stream cannot trigger or keep any growing utterance',()=>{
  let events=0;const segment=createDuplexSegment({onSpeech:()=>events++,onPCM:()=>events++,onError:()=>events++});
  for(let i=0;i<1000;i++)segment.push(new Float32Array(1024));segment.stop();
  for(let i=0;i<100;i++)segment.push(new Float32Array(1024).fill(.2));assert.equal(events,0);
});

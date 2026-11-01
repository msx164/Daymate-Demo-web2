import {test} from 'node:test';
import assert from 'node:assert/strict';
import {READING_ASSEMBLY,drawReadingAssembly,drawReadingLayer} from './readingRigAssembly.js';
test('reading assembler shares hand and arm pivots and keeps book occlusion in a balanced canvas stack',()=>{
 const calls=[],context=Object.fromEntries(['clearRect','save','translate','rotate','scale','drawImage','restore'].map(key=>[key,(...args)=>calls.push([key,...args])]));
 const image={};drawReadingAssembly(context,image);
 assert.deepEqual(calls[0],['clearRect',0,0,1024,1536]);
 assert.equal(calls.filter(call=>call[0]==='save').length,6);assert.equal(calls.filter(call=>call[0]==='restore').length,6);
 const draws=calls.filter(call=>call[0]==='drawImage');assert.equal(draws.length,6);
 assert.deepEqual(draws[3].slice(2,6),[430,600,470,310]);
 for(const [arm,hand] of [[1,4],[2,5]]){
  assert.deepEqual(READING_ASSEMBLY.layers[arm].source,READING_ASSEMBLY.layers[hand].source);
  assert.deepEqual(READING_ASSEMBLY.layers[arm].target,READING_ASSEMBLY.layers[hand].target);
  assert.equal(READING_ASSEMBLY.layers[arm].angle,READING_ASSEMBLY.layers[hand].angle);
 }
 assert.ok(READING_ASSEMBLY.layers.every(layer=>Number.isFinite(layer.scale)&&layer.scale>0));
 assert.throws(()=>drawReadingLayer(context,image,{id:'invalid'}));
});

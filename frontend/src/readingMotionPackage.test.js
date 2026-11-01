import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {loadReadingMotion} from './readingMotionPackage.js';
const base=new URL('../public/reading-preview/v2/',import.meta.url);
test('bundled reading model passes the same package validation and fingerprint check as imported models',async()=>{
 const value=await loadReadingMotion({fetcher:async url=>new Response(await fs.readFile(new URL(url.slice('/reading-preview/v2/'.length),base)))});
 assert.equal(value.clip,'0');assert.ok(value.files.has('reading.moc3'));
 const model=JSON.parse(await value.files.get('reading.model3.json').text());assert.equal(model.FileReferences.Textures.length,1);
});
test('reading loader rejects escaped paths before fetching files and rejects corrupt bytes',async()=>{
 let calls=0;
 await assert.rejects(loadReadingMotion({fetcher:async()=>{calls++;return new Response(JSON.stringify({version:1,resources:Array.from({length:4},()=>({name:'../outside.json',sha256:'a'.repeat(64)}))}));}}),/路径/);assert.equal(calls,1);
 await assert.rejects(loadReadingMotion({fetcher:async url=>url.endsWith('assets.json')?new Response(await fs.readFile(new URL('assets.json',base))):new Response('damaged')}),/指纹/);
});

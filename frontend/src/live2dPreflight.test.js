import test from 'node:test';
import assert from 'node:assert/strict';
import { checkModel, checkSDK, directoryFiles, modelPath } from './live2dPreflight.js';
function file(name, value) {
  const data = typeof value === 'object' && !(value instanceof Uint8Array) ? JSON.stringify(value) : value;
  const result = new File([data], name.split('/').at(-1));
  Object.defineProperty(result, 'webkitRelativePath', { value: 'Pack/' + name });
  return result;
}
function fixture() {
  const png = new Uint8Array(33); png.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(png.buffer); view.setUint32(8,13); png.set(new TextEncoder().encode('IHDR'),12); view.setUint32(16,1024); view.setUint32(20,1024);
  const model = { Version: 3, FileReferences: { Moc: 'Day.moc3', Textures: ['textures/a.png'] } };
  const files = directoryFiles([file('Day.model3.json', model), file('Day.moc3','MOC3fixture'), file('textures/a.png',png)]);
  return { files, model };
}
test('Live2D paths reject traversal, external URLs and ambiguous encoded filenames', () => {
  assert.equal(modelPath('textures/a.png'), 'textures/a.png');
  for (const value of ['../a','a/../b','/a','C:/a','https://x/a','a\\b','a//b','a/%2e/b','a?b','a#b','a\0b']) assert.throws(() => modelPath(value));
});
test('directory selection rejects duplicates and loose file selection', () => {
  assert.throws(() => directoryFiles([file('a.png','a'),file('A.png','a')]));
  assert.throws(() => directoryFiles([new File(['x'],'x')]));
});
test('minimal file structure passes without claiming full model validity', async () => {
  const { files } = fixture(); const result = await checkModel(files);
  assert.equal(result.ok,true); assert.equal(result.files,3); assert.match(result.message,/仍需/);
});
test('missing resources, model version and unknown reference types fail', async () => {
  const { files, model } = fixture(); files.delete('Day.moc3');
  assert.equal((await checkModel(files)).ok,false);
  for (const value of [{...model,Version:2},{...model,FileReferences:{...model.FileReferences, Script:'x.js'}}]) {
    const current = fixture().files; current.set('Day.model3.json',file('Day.model3.json',value));
    assert.equal((await checkModel(current)).ok,false);
  }
});
test('dependency references resolve relative to a nested model entry', async () => {
  const { files } = fixture(); const nested = new Map([...files].map(([name,value])=>['Model/'+name,value]));
  assert.equal((await checkModel(nested)).ok,true);
});
test('invalid JSON, bad binary headers and oversized resources fail safely', async () => {
  for (const [name, value] of [['Day.model3.json','broken'],['Day.moc3','not-moc'],['textures/a.png','not-png']]) {
    const { files } = fixture(); files.set(name,file(name,value)); assert.equal((await checkModel(files)).ok,false);
  }
  const { files } = fixture(); files.set('Day.moc3',{size:17*1024*1024}); assert.equal((await checkModel(files)).ok,false);
});
test('SDK presence check never executes a script and requires both Core and Framework', () => {
  assert.equal(checkSDK(new Map()).ok,false);
  const files = new Map([['Core/live2dcubismcore.js',{size:123}],['Framework/src/live2dcubismframework.ts',{size:123}]]);
  assert.equal(checkSDK(files).ok,true); assert.match(checkSDK(files).message,/未执行/);
});

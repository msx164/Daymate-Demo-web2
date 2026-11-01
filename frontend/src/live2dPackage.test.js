import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLive2DPackage, validatePackageManifest } from './live2dPackage.js';
const manifest = () => ({ version: 2, type: 'live2d', name: 'Local character', model: 'model/Day.model3.json', fallback: 'fallback.png',
  license: { author: 'Creator', source: 'Local original', file: 'LICENSE.txt', purpose: 'local-preview' } });
const file = value => new Blob([typeof value === 'object' && !(value instanceof Uint8Array) ? JSON.stringify(value) : value]);
function fixture() {
  const png = new Uint8Array(33); png.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(png.buffer); view.setUint32(8,13); png.set(new TextEncoder().encode('IHDR'),12); view.setUint32(16,128); view.setUint32(20,128);
  return new Map([['daymate-character.json', file(manifest())], ['LICENSE.txt', file('Local preview permission statement')],
    ['fallback.png', file(png)], ['model/Day.model3.json', file({ Version: 3, FileReferences: { Moc: 'Day.moc3', Textures: ['a.png'] } })],
    ['model/Day.moc3', file('MOC3fixture')], ['model/a.png', file(png)]]);
}
test('v2 package checks nested model, fallback and source declaration without claiming authorization or importing', async () => {
  const files = fixture(), originalSize = files.size, result = await checkLive2DPackage(files);
  assert.equal(result.ok, true); assert.equal(result.files, 6); assert.equal(files.size, originalSize);
  assert.match(result.message, /不会自动启用模型/); assert.match(result.message, /不代表获得授权/);
});
test('manifest rejects traversal, unknown execution fields and unsupported purposes', () => {
  for (const value of [{ ...manifest(), model: '../Day.model3.json' }, { ...manifest(), script: 'run.js' },
    { ...manifest(), license: { ...manifest().license, purpose: 'public-distribution' } }]) assert.throws(() => validatePackageManifest(value));
});
test('missing statement, fallback or dependencies and embedded scripts fail without reading executable content', async () => {
  for (const name of ['LICENSE.txt', 'fallback.png', 'model/Day.moc3']) {
    const files = fixture(); files.delete(name); assert.equal((await checkLive2DPackage(files)).ok, false);
  }
  const files = fixture(); files.set('run.js', { size: 1, arrayBuffer() { throw Error('Must not execute or read script'); } });
  assert.match((await checkLive2DPackage(files)).message, /代码/);
});
test('package budgets and mismatched declared entries fail', async () => {
  const files = fixture(); files.set('extra.png', { size: 65 * 1024 * 1024 });
  assert.equal((await checkLive2DPackage(files)).ok, false);
  const other = fixture(); other.set('daymate-character.json', file({ ...manifest(), model: 'other.model3.json' }));
  assert.equal((await checkLive2DPackage(other)).ok, false);
});

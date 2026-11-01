import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackageSource, decodePackageImages } from './live2dModelSource.js';
function png() {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(8,13); bytes.set(new TextEncoder().encode('IHDR'),12); view.setUint32(16,128); view.setUint32(20,128);
  return bytes;
}
test('virtual package loader reads selected nested files and rejects URL, traversal and missing resources without network fallback', async () => {
  const files = new Map([['model/A.model3.json', new Blob(['{}'])], ['model/a.moc3', new Blob(['MOC3'])]]);
  const source = createPackageSource(files, 'model/A.model3.json');
  assert.equal(await (await source.read(source.entry)).text(), '{}');
  assert.equal(await (await source.read(source.base + 'a.moc3')).text(), 'MOC3');
  for (const name of ['https://example.com/a.moc3', source.base + '../private', source.base + 'missing', source.base + 'a%2emoc3']) await assert.rejects(source.read(name));
});
test('complete image decode closes bitmaps on success, mismatch and cancellation', async () => {
  const files = new Map([['a.png', new Blob([png()])]]); let closed = 0;
  assert.equal(await decodePackageImages(files, { decode: async () => ({ width:128, height:128, close() { closed++; } }) }), 1);
  await assert.rejects(decodePackageImages(files, { decode: async () => ({ width:1, height:1, close() { closed++; } }) }));
  const abort = new AbortController();
  await assert.rejects(decodePackageImages(files, { signal: abort.signal, decode: async () => { abort.abort(); return { width:128, height:128, close() { closed++; } }; } }));
  assert.equal(closed, 3);
});
test('oversized headers and corrupt PNG are rejected before decode or model load', async () => {
  const bytes = png(); new DataView(bytes.buffer).setUint32(16, 100000);
  let decoded = false;
  await assert.rejects(decodePackageImages(new Map([['a.png', new Blob([bytes])]]), { decode: async () => { decoded = true; } }));
  await assert.rejects(decodePackageImages(new Map([['a.png', new Blob(['invalid'])]]), { decode: async () => { decoded = true; } }));
  assert.equal(decoded, false);
});

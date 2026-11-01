import { modelPath } from './live2dPreflight.js';
const prefix = '/__daymate_package__/';
// A virtual path space backed entirely by selected Blobs. Never fall through to fetch.
export function createPackageSource(files, entry) {
  modelPath(entry);
  if (!(files instanceof Map) || !files.has(entry) || !entry.endsWith('.model3.json') || files.size > 128) throw Error('模型文件集合无效。');
  for (const name of files.keys()) modelPath(name);
  return { entry: prefix + entry, base: prefix + (entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''),
    async read(url, { signal } = {}) {
      signal?.throwIfAborted();
      if (typeof url !== 'string' || !url.startsWith(prefix)) throw Error('只允许所选包内资源。');
      const key = modelPath(url.slice(prefix.length)), file = files.get(key);
      if (!(file instanceof Blob)) throw Error('包内资源不存在。');
      return new Response(file, { headers: { 'Content-Type': key.endsWith('.png') ? 'image/png' : 'application/octet-stream' } });
    },
  };
}
export async function decodePackageImages(files, { decode = createImageBitmap, signal } = {}) {
  let count = 0;
  for (const [name, file] of files) {
    if (!name.endsWith('.png')) continue;
    signal?.throwIfAborted();
    if (file.size > 8 * 1024 * 1024) throw Error('PNG 超过 8 MiB。');
    const bytes = new Uint8Array(await file.slice(0, 33).arrayBuffer());
    if (bytes.length !== 33 || [...bytes.slice(0, 8)].join() !== '137,80,78,71,13,10,26,10'
      || new TextDecoder().decode(bytes.slice(12,16)) !== 'IHDR') throw Error('PNG 文件头无效。');
    const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
    if (view.getUint32(8) !== 13 || !width || !height || width > 4096 || height > 4096) throw Error('PNG 尺寸超过预览预算。');
    let bitmap;
    try {
      bitmap = await decode(file);
      if (bitmap.width !== width || bitmap.height !== height) throw Error('PNG 解码尺寸不一致。');
      signal?.throwIfAborted(); count++;
    } finally { bitmap?.close(); }
  }
  return count;
}

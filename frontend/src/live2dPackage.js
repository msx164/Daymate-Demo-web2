import { checkModel, modelPath } from './live2dPreflight.js';
import { motionClips } from './live2dMotions.js';
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, maximum) { return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum; }
export function validatePackageManifest(value) {
  if (!plain(value) || value.version !== 2 || value.type !== 'live2d'
    || Object.keys(value).some(key => !['version', 'type', 'name', 'model', 'fallback', 'license'].includes(key))
    || !text(value.name, 60) || !plain(value.license)
    || Object.keys(value.license).some(key => !['author', 'source', 'file', 'purpose'].includes(key))
    || !text(value.license.author, 120) || !text(value.license.source, 500) || value.license.purpose !== 'local-preview') throw Error('v2 清单格式不受支持，请使用本机预览清单模板。');
  const model = modelPath(value.model), fallback = modelPath(value.fallback), license = modelPath(value.license.file);
  if (!model.endsWith('.model3.json') || !fallback.endsWith('.png') || !/\.(txt|md)$/.test(license)) throw Error('模型、PNG 回退或许可说明文件类型不匹配。');
  return { name: value.name.trim(), model, fallback, license, author: value.license.author.trim(), source: value.license.source.trim() };
}
export async function checkLive2DPackage(files) {
  try {
    if (!(files instanceof Map) || files.size > 128) throw Error('角色包最多 128 个文件。');
    let total = 0;
    for (const [name, file] of files) {
      modelPath(name);
      if (!/\.(json|moc3|png|wav|txt|md)$/.test(name)) throw Error('包内包含未支持文件或代码；请移除脚本、HTML 和外部运行库。');
      if (!Number.isSafeInteger(file.size) || file.size <= 0) throw Error('资源为空或大小无效。');
      total += file.size;
    }
    if (total > 64 * 1024 * 1024) throw Error('角色包总大小超过 64 MiB。');
    const manifest = files.get('daymate-character.json');
    if (!manifest || manifest.size > 65536) throw Error('需要根目录 daymate-character.json，且不超过 64 KiB。');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await manifest.arrayBuffer()).replace(/^\uFEFF/, ''));
    const data = validatePackageManifest(value), license = files.get(data.license), fallback = files.get(data.fallback);
    if (!license || license.size > 256 * 1024 || !fallback || fallback.size > 8 * 1024 * 1024) throw Error('缺少许可说明／回退图片，或文件过大。');
    if (!(new TextDecoder('utf-8', { fatal: true }).decode(await license.arrayBuffer())).trim()) throw Error('许可说明不能为空。');
    const bytes = new Uint8Array(await fallback.slice(0, 33).arrayBuffer());
    if (bytes.length < 33 || [...bytes.slice(0, 8)].join() !== '137,80,78,71,13,10,26,10' || new TextDecoder().decode(bytes.slice(12,16)) !== 'IHDR') throw Error('回退文件不是 PNG。');
    const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
    if (!width || !height || width > 4096 || height > 4096) throw Error('回退 PNG 宽高需在 1–4096 像素内。');
    const checked = await checkModel(files);
    if (!checked.ok) throw Error(checked.message);
    if (checked.entry !== data.model) throw Error('清单入口与唯一模型入口不一致。');
    const model=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await files.get(data.model).arrayBuffer()).replace(/^\uFEFF/,''));
    return { ok: true, ...data, files: files.size, totalBytes: total, motions:motionClips(model,data.model),
      message: '准备检查通过；仅代表文件结构，解码与实载结果见下方；不会自动启用模型，也不代表获得授权。' };
  } catch (error) { return { ok: false, message: error instanceof SyntaxError ? '清单 JSON 无效。' : error.message }; }
}

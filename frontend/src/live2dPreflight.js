const MiB = 1024 * 1024;
const limits = { json: MiB, moc: 16 * MiB, texture: 8 * MiB, total: 64 * MiB, files: 128 };
export function modelPath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value !== value.trim()
    || /[\\:%?#]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || value.startsWith('/')
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw Error('资源引用必须是包内相对路径。');
  return value;
}
export function directoryFiles(files) {
  const result = new Map();
  const seen = new Set();
  if (files.length > 4096) throw Error('目录文件过多，请选择单独的 SDK 或模型目录。');
  for (const file of files) {
    const parts = file.webkitRelativePath?.split('/');
    if (!parts || parts.length < 2) throw Error('请选择目录，而不是单个文件。');
    const relative = modelPath(parts.slice(1).join('/'));
    if (seen.has(relative.toLowerCase())) throw Error('目录包含大小写冲突或重复的文件路径。');
    seen.add(relative.toLowerCase()); result.set(relative, file);
  }
  return result;
}
async function bytes(file, maximum) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maximum) throw Error('资源缺失、为空或超过大小限制。');
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.byteLength !== file.size || data.byteLength > maximum) throw Error('资源读取长度不一致。');
  return data;
}
async function json(file) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(file, limits.json)).replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('JSON 必须是对象。');
  return value;
}
function references(model) {
  const files = model.FileReferences;
  if (model.Version !== 3 || !files || typeof files !== 'object' || Array.isArray(files)
    || typeof files.Moc !== 'string' || !Array.isArray(files.Textures) || !files.Textures.length) throw Error('模型入口需要 Version=3、FileReferences.Moc 和 Textures。');
  if (Object.keys(files).some(key => !['Moc', 'Textures', 'Physics', 'Pose', 'UserData', 'DisplayInfo', 'Expressions', 'Motions'].includes(key))) throw Error('模型含未支持的文件引用字段，需要单独评估。');
  const result = [];
  const add = (file, kind) => {
    const safe = modelPath(file);
    const suffix = { moc: '.moc3', texture: '.png', physics: '.physics3.json', pose: '.pose3.json', user: '.userdata3.json', display: '.cdi3.json', expression: '.exp3.json', motion: '.motion3.json', sound: '.wav' }[kind];
    if (!safe.endsWith(suffix)) throw Error('资源类型与引用用途不匹配。');
    result.push({ file: safe, kind });
    if (result.length > limits.files) throw Error('引用文件数超过 128。');
  };
  add(files.Moc, 'moc');
  if (files.Textures.length > 4) throw Error('首轮检查最多支持四张纹理。');
  files.Textures.forEach(file => add(file, 'texture'));
  for (const [key, kind] of [['Physics', 'physics'], ['Pose', 'pose'], ['UserData', 'user'], ['DisplayInfo', 'display']]) {
    if (Object.hasOwn(files, key)) add(files[key], kind);
  }
  if (files.Expressions !== undefined) {
    if (!Array.isArray(files.Expressions)) throw Error('Expressions 必须是数组。');
    files.Expressions.forEach(item => add(item?.File, 'expression'));
  }
  if (files.Motions !== undefined) {
    if (!files.Motions || typeof files.Motions !== 'object' || Array.isArray(files.Motions)) throw Error('Motions 必须是对象。');
    for (const group of Object.values(files.Motions)) {
      if (!Array.isArray(group)) throw Error('动作组必须是数组。');
      for (const item of group) {
        add(item?.File, 'motion');
        if (item && Object.hasOwn(item, 'Sound')) add(item.Sound, 'sound');
      }
    }
  }
  return result;
}
export async function checkModel(files) {
  try {
    const entries = [...files.keys()].filter(file => file.endsWith('.model3.json'));
    if (entries.length !== 1) throw Error('请选择仅包含一个 .model3.json 入口的模型目录。');
    const entry = entries[0], prefix = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
    const model = await json(files.get(entry));
    const dependencies = references(model);
    const checked = new Map();
    let totalBytes = files.get(entry).size;
    for (const dependency of dependencies) {
      const relative = prefix + dependency.file;
      if (checked.has(relative)) {
        if (checked.get(relative) !== dependency.kind) throw Error('同一文件被用于不同资源类型。');
        continue;
      }
      const file = files.get(relative);
      const maximum = dependency.kind === 'moc' ? limits.moc : ['texture', 'sound'].includes(dependency.kind) ? limits.texture : limits.json;
      if (!file || file.size > maximum || file.size <= 0) throw Error(`资源缺失或过大：${dependency.file}`);
      totalBytes += file.size;
      if (totalBytes > limits.total) throw Error('模型引用资源合计超过 64 MiB。');
      if (dependency.kind === 'texture') {
        const data = new Uint8Array(await file.slice(0, 33).arrayBuffer());
        if (data.length < 33 || [...data.slice(0, 8)].join() !== '137,80,78,71,13,10,26,10'
          || new TextDecoder().decode(data.slice(12, 16)) !== 'IHDR' || new DataView(data.buffer).getUint32(8) !== 13) throw Error('纹理不是 PNG。');
        const view = new DataView(data.buffer), width = view.getUint32(16), height = view.getUint32(20);
        if (!width || !height || width > 2048 || height > 2048) throw Error('首轮纹理宽高不能超过 2048 像素。');
      } else if (dependency.kind === 'moc') {
        const data = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (new TextDecoder().decode(data) !== 'MOC3') throw Error('模型二进制缺少 MOC3 文件头。');
      } else if (dependency.kind !== 'sound') await json(file);
      checked.set(relative, dependency.kind);
    }
    return { ok: true, entry, files: checked.size + 1, totalBytes,
      message: '文件结构检查通过；仍需 Core 一致性检查、纹理解码、模型实载及许可核对。' };
  } catch (error) { return { ok: false, message: error instanceof SyntaxError ? '模型 JSON 无效。' : error.message }; }
}
export function checkSDK(files) {
  const required = ['Core/live2dcubismcore.js', 'Framework/src/live2dcubismframework.ts'];
  const missing = required.filter(file => !files.get(file)?.size || files.get(file).size > 32 * MiB);
  return { ok: !missing.length, missing, message: missing.length ? 'SDK 不完整，请选择官方完整 SDK 的根目录。' : 'SDK 关键文件存在；未执行代码，未验证版本兼容性或授权来源。' };
}

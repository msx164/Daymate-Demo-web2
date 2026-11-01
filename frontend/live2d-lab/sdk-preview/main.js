import { createRuntime } from './runtime.js';
import { createPackageSource, decodePackageImages } from '../../src/live2dModelSource.js';
import { checkLive2DPackage } from '../../src/live2dPackage.js';
const notify = (phase, detail = '', diagnostics = null) => parent.postMessage({ type: 'daymate-sdk-preview', phase, detail, diagnostics }, location.origin);
const canvas = document.createElement('canvas'), propCanvas = document.createElement('canvas'); document.body.append(canvas, propCanvas);
Object.assign(propCanvas.style, { position:'absolute', inset:'0', pointerEvents:'none' });
const custom = location.hash === '#package';
let runtime, starting = false, closed = false;
const abort = new AbortController();
function create(modelSource = null) {
  runtime = createRuntime({ canvas, propCanvas, modelSource,
    onReady: diagnostics => notify('ready', `所选模型已完成加载，${diagnostics.drawables} 个绘制对象，透明背景。`, diagnostics),
    onError: () => notify('error', '模型加载或绘制失败，已使用 PNG 回退。'),
    onNativeStatus: value=>parent.postMessage({type:'daymate-sdk-preview',phase:'motion',motion:value},location.origin),
  });
  return runtime;
}
window.daymateLive2DPreview = { dispose() { closed = true; abort.abort(); return runtime?.dispose(); }, diagnostics: () => runtime?.diagnostics() }; // Development only; no backend access.
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'daymate-preview-control') return;
  if (!runtime) return;
  if (event.data.action === 'state') runtime.setState(event.data.value);
  if (event.data.action === 'activity') runtime.setActivity(event.data.value);
  if (event.data.action === 'propSettings') runtime.setPropSettings(event.data.value);
  if (event.data.action === 'motion') runtime.setMotionEnabled(event.data.value);
  if (event.data.action === 'reduced') runtime.setReducedMotion(event.data.value);
  if (event.data.action === 'dispose') notify('disposed', '', runtime.dispose());
});
window.addEventListener('message',event=>{
  if(!custom || !runtime || event.origin!==location.origin || event.source!==parent || event.data?.type!=='daymate-native-motion')return;
  runtime.nativeMotion(event.data.action,event.data.id);
});
window.addEventListener('message', async event => {
  if (!custom || closed || starting || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'daymate-package-load') return;
  starting = true;
  try {
    const files = new Map(event.data.files), checked = await checkLive2DPackage(files);
    if (!checked.ok) throw Error('Package rejected');
    await decodePackageImages(files, { signal: abort.signal });
    if (closed) return;
    await create(createPackageSource(files, checked.model)).load();
  } catch { if (!closed) notify('error', '模型包无法解码或加载，已恢复 PNG。'); }
});
window.addEventListener('beforeunload', () => window.daymateLive2DPreview.dispose(), { once: true });
// An explicit fixture hash is reserved for local SDK regression tests; the application always loads a generated package.
if(location.hash==='#fixture')void create().load();

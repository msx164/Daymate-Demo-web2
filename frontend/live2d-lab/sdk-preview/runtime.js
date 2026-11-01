import { CubismFramework, LogLevel } from '@framework/live2dcubismframework';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismWebGLOffscreenManager } from '@framework/rendering/cubismoffscreenmanager';
import { CubismPose } from '@framework/effect/cubismpose';
import { animatedState, live2dState } from '../../src/live2dState.js';
import { createPresentationMotion } from '../../src/live2dPresentation.js';
import { trackGLResources } from '../../src/live2dGLResources.js';
import { canvasSize, createFrameStats, createFrameGate, modelFitHeight } from '../../src/live2dPerformance.js';
import { activityId } from '../../src/companionActivities.js';
import { drawActivityProps } from '../../src/live2dActivityProps.js';
import { propSettings } from '../../src/activityProps.js';
import { motionClips } from '../../src/live2dMotions.js';
import { createNativePlayer } from './native-motions.js';

const assets = new URL('../sdk-assets/', location.href).pathname;
const shaders = assets + 'Framework/Shaders/WebGL/';
export function createRuntime({ canvas, propCanvas, onReady, onError, onNativeStatus=()=>{}, fetchResource = fetch, modelSource = null }) {
  const propContext = propCanvas?.getContext('2d');
  const base = modelSource?.base || assets + 'Resources/Haru/';
  const abort = new AbortController(), textures = new Set();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const timing = createFrameStats();
  const gate = createFrameGate(30);
  let resolution, measuredDPR;
  let gl, ledger, user, pose, observer, frame = 0, frames = 0, ready = false, disposed = false, initialized = false, prepared = false;
  let state = 'idle', activity = 'idle', motion = true, reduced = media.matches, parentReduced = false, haruArms = false;
  let parameters = {}, appliedParameters = {}, firstFrame = null, motionSeconds=0;
  const presentation=createPresentationMotion();
  let parameterLimits = {};
  let propsView=propSettings();
  let previousActivity='idle',previousProps=propsView,previousSeconds=0;
  let lastTick=null;
  let failure='';
  const nativePlayer=createNativePlayer({read,getModel:()=>user?.getModel(),getPose:()=>pose,schedule,onStatus:onNativeStatus});
  const active = () => !disposed && !nativePlayer.isPaused() && animatedState(state, motion, reduced || parentReduced);
  const report = () => ({ disposed, ready, state, activity, motion, reduced: reduced || parentReduced, animated: active(), pendingFrame: !!frame,
    frames, textures: textures.size, model: !!user, poseLoaded: !!pose, width: canvas.width, height: canvas.height,
    drawables: user?.getModel()?.getDrawableCount() || 0, parameters, appliedParameters, parameterLimits, haruArms,
    geometrySample:user?.getModel()?.getDrawableCount()?Array.from(user.getModel().getDrawableVertices(0).slice(0,16)):[],
    geometrySamples:user?.getModel()?Array.from({length:Math.min(32,user.getModel().getDrawableCount())},(_,index)=>({id:user.getModel().getDrawableId(index).getString(),opacity:user.getModel().getDrawableOpacity(index),points:Array.from(user.getModel().getDrawableVertices(index).slice(0,16))})):[],
    props: !!propContext && propsView.visible && activity !== 'idle' && !disposed, propSettings:propsView,motionSeconds,nativeMotion:nativePlayer.diagnostics(),failure, firstFrame, handles: ledger?.snapshot() || {}, timing: timing.snapshot() });
  const resize = () => {
    if (!gl || disposed) return;
    const box = canvas.getBoundingClientRect();
    measuredDPR = devicePixelRatio;
    const { width, height } = canvasSize(box.width, box.height, devicePixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height; user?.setRenderTargetSize(width, height);
      if (propCanvas) { propCanvas.width = width; propCanvas.height = height; }
    }
    schedule();
  };
  function watchResolution() {
    resolution?.removeEventListener('change', resolutionChange);
    resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    resolution.addEventListener('change', resolutionChange);
  }
  function resolutionChange() { resize(); watchResolution(); }
  function schedule() { if (!disposed && prepared && user?.getModel() && !frame) frame = requestAnimationFrame(draw); }
  function draw(now) {
    frame = 0;
    if (disposed || !user?.getModel()) return;
    if (ready && active() && !gate.due(now)) { schedule(); return; }
    try {
      const drawStart = performance.now();
      if (measuredDPR !== devicePixelRatio) { resize(); watchResolution(); }
      if (gl.isContextLost()) throw Error('WebGL context lost');
      const model = user.getModel(), matrix = user.getModelMatrix(), projection = new CubismMatrix44();
      matrix.setHeight(modelFitHeight(canvas.width, canvas.height, model.getCanvasWidth(), model.getCanvasHeight()));
      projection.scale(canvas.height / canvas.width, 1);
      projection.multiplyByMatrix(matrix);
      model.loadParameters();
      const sample=presentation.sample({now,animated:active(),state,activity});motionSeconds=sample.seconds;
      const native=nativePlayer.tick(lastTick===null?0:(now-lastTick)/1000,active());lastTick=now;
      if(native){parameters={};appliedParameters=native;presentation.adopt(native);}
      else {
        parameters = sample.parameters;
        appliedParameters = {};
        for (const [name, value] of Object.entries(parameters)) {
          const index = model.getParameterIndex(CubismFramework.getIdManager().getId(name));
          if (index >= 0 && index < model.getParameterCount()) { model.setParameterValueByIndex(index, value); appliedParameters[name] = model.getParameterValueByIndex(index); }
        }
      }
      // Keep the model's authored arm parts: Haru's alternate B parts are crossed/raised gestures, not gripping poses.
      pose?.updateParameters(model, native && active()?1/30:0); model.update();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const manager = CubismWebGLOffscreenManager.getInstance(); manager.beginFrameProcess(gl);
      const renderer = user.getRenderer(); renderer.setMvpMatrix(projection);
      renderer.setRenderState(null, [0, 0, canvas.width, canvas.height]); renderer.drawModel(shaders);
      manager.endFrameProcess(gl); manager.releaseStaleRenderTextures(gl);
      const propFrame={ width:canvas.width, height:canvas.height,
        figureHeight:canvas.height * modelFitHeight(canvas.width,canvas.height,model.getCanvasWidth(),model.getCanvasHeight()) / 2,
        seconds:motionSeconds, animated:true,settings:propsView };
      // The presentation clock already freezes with pause/static mode; fade props on scene changes.
      const progress=active()?Math.min(1,motionSeconds/.45):1;
      drawActivityProps(propContext,{...propFrame,activity:previousActivity,settings:previousProps,seconds:previousSeconds,opacity:1-progress});
      drawActivityProps(propContext,{...propFrame,activity,clear:false,opacity:progress});
      frames++;
      if (!ready) {
        const corner = new Uint8Array(4), center = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner);
        gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, center);
        if (center[3] > 0) { ready = true; firstFrame = { cornerAlpha: corner[3], centerAlpha: center[3] }; onReady(report()); }
      }
      if (ready && active()) timing.record(now, performance.now() - drawStart);
      if (!ready || active()) schedule();
    } catch (error) { failure=String(error?.message||'Drawing failed').slice(0,200);if (!disposed) { dispose(); onError(); } }
  }
  function dispose() {
    if (disposed) return report();
    disposed = true; abort.abort(); cancelAnimationFrame(frame); frame = 0;
    observer?.disconnect(); media.removeEventListener('change', mediaChange);
    resolution?.removeEventListener('change', resolutionChange); window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', lost);
    nativePlayer.dispose();
    try { user?.deleteRenderer(); } catch { /* Context may already be lost. */ }
    CubismPose.delete(pose); pose = null;
    try { user?.release(); } catch { /* Still release textures and context below. */ }
    user = null;
    if (propCanvas) { propCanvas.width = 0; propCanvas.height = 0; }
    for (const texture of textures) gl?.deleteTexture(texture);
    textures.clear();
    if (initialized) {
      try { CubismWebGLOffscreenManager.getInstance().release(); CubismFramework.dispose(); CubismFramework.cleanUp(); } catch { /* Context teardown is the final fallback. */ }
      initialized = false;
    }
    ledger?.release(); gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return report();
  }
  function lost(event) { event.preventDefault(); if (!disposed) { dispose(); onError(); } }
  function mediaChange(event) { reduced = event.matches; nativePlayer.resetClock();presentation.resetClock();timing.resetGap(); schedule(); }
  async function read(url) {
    const response = await (modelSource ? modelSource.read(url, { signal: abort.signal }) : fetchResource(url, { signal: abort.signal }));
    if (!response.ok) throw Error('Resource unavailable');
    return response;
  }
  async function load() {
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (!gl) throw Error('WebGL unavailable');
      ledger = trackGLResources(gl);
      canvas.addEventListener('webglcontextlost', lost); media.addEventListener('change', mediaChange);
      window.addEventListener('resize', resize); watchResolution();
      if (!CubismFramework.startUp({ loggingLevel: LogLevel.LogLevel_Off })) throw Error('Core unavailable');
      CubismFramework.initialize(); initialized = true;
      const entry = await (await read(modelSource?.entry || base + 'Haru.model3.json')).json();
      if(modelSource)nativePlayer.configure(motionClips(entry,'selected.model3.json').map(clip=>({...clip,file:base+clip.file})));
      if (disposed) return;
      const moc = await (await read(base + entry.FileReferences.Moc)).arrayBuffer();
      if (disposed) return;
      user = new CubismUserModel(); user.loadModel(moc, true);
      if (!user.getModel()) throw Error('Model rejected');
      const model = user.getModel();
      for (const id of ['ParamArmLA','ParamArmRA','ParamArmLB','ParamArmRB','ParamHandAngleL','ParamHandAngleR','ParamDayReach','ParamDayWrist','ParamDaySupport','ParamDayPage']) {
        const index = model.getParameterIndex(CubismFramework.getIdManager().getId(id));
        if (index < model.getParameterCount()) parameterLimits[id] = { min:model.getParameterMinimumValue(index), max:model.getParameterMaximumValue(index), default:model.getParameterDefaultValue(index) };
      }
      if (entry.FileReferences.Pose) {
        const poseBytes = await (await read(base + entry.FileReferences.Pose)).arrayBuffer();
        if (disposed) return;
        pose = CubismPose.create(poseBytes, poseBytes.byteLength);
        if (!pose) throw Error('Pose rejected');
        pose.updateParameters(user.getModel(), 1); user.getModel().saveParameters();
        const poseGroups = JSON.parse(new TextDecoder().decode(poseBytes)).Groups;
        const ids = new Set(Array.isArray(poseGroups) ? poseGroups.flat().map(part => part.Id) : []);
        haruArms = ['Part01ArmLA001','Part01ArmLB001','Part01ArmRA001','Part01ArmRB001'].every(id => ids.has(id));
      }
      user.getModel().saveParameters();
      resize(); user.createRenderer(canvas.width, canvas.height);
      const renderer = user.getRenderer(); renderer.startUp(gl); renderer.setIsPremultipliedAlpha(true);
      let index = 0;
      for (const file of entry.FileReferences.Textures) {
        const blob = await (await read(base + file)).blob();
        if (disposed) return;
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
        try {
          if (disposed) return;
          const texture = gl.createTexture(); if (!texture) throw Error('Texture unavailable');
          textures.add(texture); gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
          renderer.bindTexture(index++, texture);
        } finally { bitmap.close(); }
      }
      if (disposed) return;
      prepared = true; observer = new ResizeObserver(resize); observer.observe(canvas);
      schedule();
    } catch { if (!disposed) { dispose(); onError(); } }
  }
  return { load, dispose, diagnostics: report,
    setState(value) { if (!disposed) { const next=live2dState(value);if(state!==next){nativePlayer.resetClock();presentation.resetClock();}state = next; timing.resetGap(); schedule(); } },
    setActivity(value) { if (!disposed && activity !== activityId(value)) { previousActivity=activity;previousProps=propsView;previousSeconds=motionSeconds;activity = activityId(value); timing.resetGap(); schedule(); } },
    setPropSettings(value) { if(!disposed){propsView=propSettings(value);schedule();} },
    nativeMotion(action,id){if(modelSource && !disposed)void nativePlayer.control(action,id);},
    setMotionEnabled(value) { if (!disposed && typeof value === 'boolean') { if(motion!==value){nativePlayer.resetClock();presentation.resetClock();}motion = value; timing.resetGap(); schedule(); } },
    setReducedMotion(value) { if (!disposed && typeof value === 'boolean') { if(parentReduced!==value){nativePlayer.resetClock();presentation.resetClock();}parentReduced = value; timing.resetGap(); schedule(); } },
  };
}

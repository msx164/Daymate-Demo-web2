import { useCallback, useEffect, useRef, useState } from 'react';
import { directoryFiles } from '../live2dPreflight.js';
import { checkLive2DPackage } from '../live2dPackage.js';
import { decodePackageImages } from '../live2dModelSource.js';
import { useWindowVisibility } from '../hooks/useWindowVisibility.js';
import { Live2DPackagePreview, PackageFallback } from './Live2DPackagePreview.jsx';
import { LIVE2D_STATES } from '../live2dState.js';
import { COMPANION_STATES } from '../companionAppearance.js';
import { ActivitySelector } from './ActivitySelector.jsx';
import { ActivityPropControls } from './ActivityPropControls.jsx';
import { DEFAULT_PROP_SETTINGS } from '../activityProps.js';
import { NativeMotionControls } from './NativeMotionControls.jsx';
import {useReducedMotion} from '../hooks/useReducedMotion.js';
import { ActivityMotionBindings } from './ActivityMotionBindings.jsx';
import { createActivityMotionMapping } from '../activityMotionMapping.js';
export function Live2DPackageCheck() {
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false), [preview, setPreview] = useState(''), [state, setState] = useState('idle'), [motion, setMotion] = useState(true);
  const revision = useRef(0), abort = useRef(null);
  const [files, setFiles] = useState(null);
  const [activity, setActivity] = useState('idle');
  const [props,setProps]=useState({...DEFAULT_PROP_SETTINGS});
  const [native,setNative]=useState('idle'),[nativeReady,setNativeReady]=useState(false),[clip,setClip]=useState('0'),[command,setCommand]=useState(null);
  const commandId=useRef(0);
  const mapper=useRef(createActivityMotionMapping());
  const [mappingEnabled,setMappingEnabled]=useState(false),[bindings,setBindings]=useState({});
  useEffect(()=>{
    const request=mapper.current.update({ready:nativeReady,enabled:mappingEnabled,activity,bindings,clips:result?.motions||[]});
    if(request)setCommand({...request,sequence:++commandId.current});
  },[nativeReady,mappingEnabled,activity,bindings,result]);
  const reduced=useReducedMotion();
  const visible = useWindowVisibility(), available = import.meta.env.VITE_DAYMATE_LIVE2D === '1';
  const ready = useCallback(() => {setNativeReady(true);setPreview('模型实载成功。仅在本机预览，未替换首页或桌宠。');}, []);
  const failed = useCallback(() => { setRunning(false);setNativeReady(false); setPreview('模型加载或绘制失败，已恢复 PNG；可停止后重试或选择其他模型。'); }, []);
  const nativeStatus=useCallback(value=>setNative(value.phase),[]);
  useEffect(() => {
    const hidden = visible => { if (!visible) { revision.current++; abort.current?.abort(); setBusy(false); setRunning(false);setNativeReady(false);setNative('idle'); setPreview('窗口已隐藏，预览停止。'); } };
    const change = () => hidden(!document.hidden), unsubscribe = window.daymateDesktop?.onVisibility?.(hidden);
    document.addEventListener('visibilitychange', change);
    return () => { unsubscribe?.(); document.removeEventListener('visibilitychange', change); };
  }, []);
  useEffect(() => () => { revision.current++; abort.current?.abort(); }, []);
  async function check(event) {
    const id = ++revision.current, list = [...event.target.files];
    if (!list.length) return;
    abort.current?.abort(); setRunning(false); setPreview(''); setFiles(null);setProps({...DEFAULT_PROP_SETTINGS});setNativeReady(false);setNative('idle');setClip('0');setCommand(null);
    setBusy(true); setResult(null);setMappingEnabled(false);setBindings({});setActivity('idle');
    try { const map = directoryFiles(list), value = await checkLive2DPackage(map); if (id === revision.current) { setFiles(value.ok ? map : null); setResult(value); } }
    catch (error) { if (id === revision.current) setResult({ ok: false, message: error.message }); }
    finally { if (id === revision.current) setBusy(false); }
  }
  async function start() {
    if (!result?.ok || !files || busy || running || !visible) return;
    const id = ++revision.current, controller = new AbortController(); abort.current = controller;
    setBusy(true);setNativeReady(false);setNative('idle');setCommand(null); setPreview('正在完整解码 PNG…');
    try {
      await decodePackageImages(files, { signal: controller.signal });
      if (id === revision.current) { setPreview('图片解码通过，正在实载模型…'); setRunning(true); }
    } catch { if (id === revision.current) setPreview('图片无法完整解码，预览未启动。请更换有效 PNG 后重试。'); }
    finally { if (id === revision.current) setBusy(false); }
  }
  function stop() { revision.current++; abort.current?.abort(); setBusy(false); setRunning(false);setNativeReady(false);setNative('idle');setCommand(null); setPreview('预览已停止，显示 PNG 回退形象。'); }
  return <section className="live2d-package-check"><h3>Live2D v2 角色包准备检查</h3>
    <p>选择本机角色包目录，检查来源说明、入口、引用资源和 PNG 回退；不上传、不执行包内代码，也不替换当前角色。</p>
    <label>选择 v2 包目录<input aria-label="选择 Live2D v2 包目录" type="file" webkitdirectory="" multiple disabled={busy} onChange={check} /></label>
    {busy && <p role="status">正在检查本机文件…</p>}
    {result && <div role="status" className={result.ok ? 'form-hint' : 'form-error'}>{result.message}
      {result.ok && <p>{result.name} · {result.files} 个文件 · 作者声明：{result.author} · 来源声明：{result.source}</p>}</div>}
    {result?.ok && <div className="package-preview-controls">
      <div className="package-preview-canvas">{running && visible
        ? <Live2DPackagePreview files={files} fallback={files.get(result.fallback)} state={state} motion={motion} activity={activity} propSettings={props} motionCommand={command} onNativeMotion={nativeStatus} onReady={ready} onError={failed} />
        : <PackageFallback file={files?.get(result.fallback)} />}</div>
      {available ? <div className="diagnostic-actions"><button disabled={busy || running || !visible} onClick={start}>启动所选模型预览</button>
        <button disabled={!running && !busy} onClick={stop}>停止所选模型预览</button></div> : <p>请用源码 Demo 启动，普通网页与安装包尚未提供自选模型运行器。</p>}
      <label>预览状态 <select aria-label="自选模型预览状态" value={state} onChange={event => setState(event.target.value)}>{LIVE2D_STATES.map(value => <option key={value} value={value}>{COMPANION_STATES[value].label}</option>)}</select></label>
      <ActivitySelector label="自选模型场景动作" value={activity} onChange={setActivity} automatic={false} />
      {available && <ActivityMotionBindings clips={result.motions||[]} enabled={mappingEnabled} onEnabled={setMappingEnabled} bindings={bindings} onBinding={(id,value)=>setBindings(previous=>({...previous,[id]:value}))} />}
      <ActivityPropControls value={props} onChange={patch=>setProps(value=>({...value,...patch}))} onReset={()=>setProps({...DEFAULT_PROP_SETTINGS})} prefix="预览" disabled={activity==='idle'} />
      <label><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} />所选模型轻微动作</label>
      <p className="package-preview-status" role="status">{preview || '准备就绪，可手动启动实载预览。'}</p>
      {available && <NativeMotionControls clips={result.motions||[]} selected={clip} onSelect={setClip} status={native} ready={nativeReady} staticMode={reduced || !motion || ['paused','saving'].includes(state)} onCommand={(action,id)=>setCommand({action,id,sequence:++commandId.current})} />}
      <p className="form-hint">不播放物理或声音，不保证任意模型兼容。切页、隐藏或停止会释放模型；预览通过不代表获得使用或发行授权。</p>
    </div>}
    <details><summary>清单示例与边界</summary><pre>{JSON.stringify({ version: 2, type: 'live2d', name: '我的角色', model: 'model/character.model3.json', fallback: 'fallback.png',
      license: { author: '作者名称', source: '作品来源或原创说明', file: 'LICENSE.txt', purpose: 'local-preview' } }, null, 2)}</pre>
      <p>结构检查不代表已获使用或发行授权。这里的模型包仅作临时预览；首页和桌宠使用 Day 或从本机图片生成的角色。</p></details>
  </section>;
}

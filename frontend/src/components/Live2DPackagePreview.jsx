import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPreviewSession } from '../live2dSession.js';
import day from '../assets/companion/day-v1.png';
export function PackageFallback({ file }) {
  const image = useRef(null);
  useEffect(() => {
    if (!file) return;
    const value = URL.createObjectURL(file), element = image.current; element.src = value;
    return () => { element.src = day; URL.revokeObjectURL(value); };
  }, [file]);
  return <img ref={image} src={day} alt="所选角色的 PNG 回退形象" onError={event => { if (event.currentTarget.getAttribute('src') !== day) event.currentTarget.src = day; }} />;
}
export function Live2DPackagePreview({ files, fallback, state, motion, activity = 'idle', propSettings, motionCommand, onNativeMotion, onReady, onError }) {
  const frame = useRef(null), session = useRef(null), [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const connection = createPreviewSession({ host: window, child: frame.current.contentWindow,
      onReady: () => { setReady(true); onReady(); }, onError,onNativeMotion });
    session.current = connection;
    return () => { session.current = null; connection.dispose(); };
  }, [onReady, onError,onNativeMotion]);
  useEffect(()=>{if(ready && motionCommand)session.current?.requestMotion(motionCommand.action,motionCommand.id);},[ready,motionCommand]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => session.current?.update({ state, motion, activity, propSettings, reduced: media.matches });
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [state, motion, activity, propSettings]);
  return <>
    {!ready && <PackageFallback file={fallback} />}
    <iframe ref={frame} className="package-live2d-frame" style={{ opacity: ready ? 1 : 0 }} title="自选 Live2D 模型本机预览"
      src="/__live2d/sdk-preview/#package" sandbox="allow-scripts allow-same-origin"
      onLoad={() => frame.current?.contentWindow.postMessage({ type: 'daymate-package-load', files: [...files] }, location.origin)}
      onError={() => session.current?.fail()} />
  </>;
}

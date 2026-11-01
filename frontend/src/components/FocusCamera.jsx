import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createLocalMedia} from '../localMedia.js';
import {CameraObserver} from './CameraObserver.jsx';
export function FocusCamera({available,activity,inquiryTarget}){
  const [media]=useState(()=>createLocalMedia({capture:value=>navigator.mediaDevices.getUserMedia(value),authorize:(kind,enabled)=>window.daymateDesktop?.setCapturePermission(kind,enabled)??Promise.resolve(true)}));
  const view=useSyncExternalStore(media.subscribe,media.getSnapshot),video=useRef(null);
  useEffect(()=>{
    const stop=()=>media.stop('video'),visibility=()=>{if(document.hidden)stop();};
    const unsubscribe=window.daymateDesktop?.onVisibility?.(visible=>{if(!visible)stop();});
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
    return()=>{unsubscribe?.();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);stop();};
  },[media]);
  useEffect(()=>{if(!available)media.stop('video');},[available,media]);
  useEffect(()=>{const element=video.current;element.srcObject=view.video.stream;if(view.video.stream)void element.play().catch(()=>{});return()=>{element.srcObject=null;};},[view.video.stream]);
  return <details className="focus-camera"><summary>摄像头监督</summary>
    <button aria-label="切换专注摄像头" disabled={!available} onClick={()=>view.video.status==='off'?void media.start('video'):media.stop('video')}>{view.video.status==='pending'?'取消开启':view.video.status==='on'?'关闭专注摄像头':'开启专注摄像头'}</button>
    <video ref={video} muted autoPlay playsInline hidden={view.video.status!=='on'} aria-label="专注摄像头预览"/>
    {view.video.error&&<p className="form-error" role="alert">{view.video.error}</p>}
    <CameraObserver video={video} stream={view.video.stream} activity={activity} inquiryTarget={inquiryTarget}/>
    <p className="form-hint">暂停、结束专注或隐藏窗口会关闭设备，继续时需手动开启；观察不会更改计时或任务完成状态。</p>
  </details>;
}

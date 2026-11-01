import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createLocalMedia } from '../localMedia.js';
import { Live2DCompanion } from './Live2DCompanion.jsx';
import { resolveScene } from '../companionScenes.js';
import dayRoom from '../assets/companion/study-day-v1.png';
import nightRoom from '../assets/companion/study-night-v1.png';
import kitchenRoom from '../assets/companion/kitchen-v1.png';
import loungeRoom from '../assets/companion/lounge-v1.png';
import './VideoCompanion.css';
import { VoiceControls } from './VoiceControls.jsx';
import { CameraObserver } from './CameraObserver.jsx';
import {TalkingDay} from './TalkingDay.jsx';

export function VideoCompanion({ appearance, live2d, state, activity, propSettings, onClose, onChat }) {
  const [panel,setPanel]=useState(null),[inquiryTarget,setInquiryTarget]=useState(null);
  const [media] = useState(() => createLocalMedia({
    capture: constraints => {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Media unavailable');
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    authorize: (kind, enabled) => window.daymateDesktop?.setCapturePermission(kind, enabled) ?? Promise.resolve(true),
  }));
  const devices = useSyncExternalStore(media.subscribe, media.getSnapshot);
  const video = useRef(null);
  const [backgroundNotice, setBackgroundNotice] = useState('');
  const [lipEnabled,setLipEnabled]=useState(false),[mouthX,setMouthX]=useState(501),[mouthY,setMouthY]=useState(179);
  useEffect(() => {
    let mounted = true;
    const hidden = () => { media.stopAll(); if (mounted) setBackgroundNotice('窗口已隐藏，设备已关闭；需要时请手动重新开启。'); };
    const visibility = () => { if (document.hidden) hidden(); };
    const unsubscribe = window.daymateDesktop?.onVisibility(visible => { if (!visible) hidden(); });
    window.daymateDesktop?.getVisibility().then(visible => { if (mounted && !visible) hidden(); }).catch(() => { if (mounted) hidden(); });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hidden);
    return () => { mounted = false; unsubscribe?.(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hidden); media.stopAll(); };
  }, [media]);
  useEffect(() => {
    const element = video.current;
    element.srcObject = devices.video.stream;
    if (devices.video.stream) void element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [devices.video.stream]);
  function toggle(kind) {
    setBackgroundNotice('');
    if(kind==='audio'&&devices.audio.status==='off')setPanel('voice');
    if(kind==='video'&&devices.video.status==='off')setPanel('camera');
    if (devices[kind].status === 'off') void media.start(kind); else media.stop(kind);
  }
  const { settings } = appearance;
  const scene = resolveScene(settings.scene, activity);
  return <section className="video-companion" aria-label="视频式陪伴" data-local-only="true">
    <div className="call-stage" style={{ backgroundImage: `url(${({ day: dayRoom, night: nightRoom, kitchen: kitchenRoom, lounge: loungeRoom })[scene]})` }}>
      <div className="call-heading"><h2>一起，专心此刻。</h2></div>
      <div className="call-character">{lipEnabled&&settings.character==='day'?<TalkingDay x={mouthX} y={mouthY}/>:<Live2DCompanion enabled={live2d.enabled} character={settings.character} state={state} motion={settings.motion} activity={activity} propSettings={propSettings} />}</div>
      <div className="call-self" data-camera={devices.video.status} hidden={devices.video.status==='off'}>
        <video ref={video} muted playsInline autoPlay aria-label="我的摄像头预览" hidden={devices.video.status !== 'on'} />
        {devices.video.status !== 'on' && <div>{devices.video.status === 'pending' ? '等待摄像头授权…' : '摄像头已关闭'}</div>}
        <span>我 · 本机镜像</span>
      </div>
      <span className="call-day-label">{settings.character === 'custom' ? '我的角色' : settings.character === 'robot' ? '经典机器人' : 'Day'} · 陪伴画面</span>
    </div>
    <div className="call-toolbar" role="group" aria-label="陪伴设备控制">
      <button onClick={() => toggle('video')} aria-pressed={devices.video.status === 'on'} aria-label="切换摄像头">{devices.video.status === 'pending' ? '取消开启摄像头' : devices.video.status === 'on' ? '关闭摄像头' : '开启摄像头'}</button>
      <button onClick={() => toggle('audio')} aria-pressed={devices.audio.status === 'on'} aria-label="切换麦克风">{devices.audio.status === 'pending' ? '取消开启麦克风' : devices.audio.status === 'on' ? '关闭麦克风' : '开启麦克风'}</button>
      <button onClick={()=>{setPanel(null);onChat?.();}}>文字</button>
      <button aria-label="陪伴更多选项" aria-expanded={panel==='options'} onClick={()=>setPanel(panel==='options'?null:'options')}>•••</button>
      <button className="call-hangup" onClick={() => { media.stopAll(); onClose(); }}>结束陪伴</button>
    </div>
    <div className="session-alerts" ref={setInquiryTarget}/>
    <div className="call-notices">
    {[devices.video.error, devices.audio.error].filter(Boolean).map((error, i) => <p key={i} className="form-error" role="alert">{i === 0 && devices.video.error ? '摄像头' : '麦克风'}：{error}</p>)}
    {backgroundNotice && <p role="status">{backgroundNotice}</p>}
    </div>
    <aside className="session-drawer call-tools" hidden={!panel} aria-label="陪伴选项">
    <div className="drawer-heading"><h2>{({voice:'语音对话',camera:'摄像头监督',options:'陪伴选项'})[panel]}</h2><button aria-label="收起陪伴选项" onClick={()=>setPanel(null)}>×</button></div>
    <div hidden={panel!=='options'}>
    <div className="session-option-links"><button onClick={()=>setPanel('voice')}>语音设置</button><button onClick={()=>setPanel('camera')}>摄像头监督</button></div>
    <p className="form-hint">设备按需开启，画面仅本机处理。隐藏窗口或结束陪伴会关闭设备。</p>
    {settings.character==='day'&&<details className="lip-controls"><summary>Day 同步口型</summary><label><input aria-label="启用 Day 同步口型" type="checkbox" checked={lipEnabled} onChange={event=>setLipEnabled(event.target.checked)}/>启用 Day 同步 2D 口型</label><p>使用原版 Day，随本机声音的视素事件变化；声音不提供视素时按词边界估计。当前基础 Live2D 缺少口部绑定，此预览使用独立 2D 嘴形，开启后替代视频区 Live2D。精细分层口型仍需制作。</p><label>横向校准<input aria-label="口型横向校准" type="range" min="485" max="518" value={mouthX} onChange={event=>setMouthX(Number(event.target.value))}/></label><label>纵向校准<input aria-label="口型纵向校准" type="range" min="165" max="195" value={mouthY} onChange={event=>setMouthY(Number(event.target.value))}/></label></details>}
    </div>
    <div hidden={panel!=='voice'}><VoiceControls stream={devices.audio.stream} /></div>
    <div hidden={panel!=='camera'}><CameraObserver video={video} stream={devices.video.stream} activity={activity} inquiryTarget={inquiryTarget}/></div>
    </aside>
  </section>;
}

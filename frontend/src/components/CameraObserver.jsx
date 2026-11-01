import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {createPresencePolicy} from '../presenceObserver.js';
import {observationSettings} from '../observationSettings.js';
import {TaskPostureObserver} from './TaskPostureObserver.jsx';
import {createCameraInference} from '../cameraInference.js';
import {TaskObjectObserver} from './TaskObjectObserver.jsx';
import {createCameraReminderGate} from '../cameraReminderGate.js';
import {createCameraDiagnostics} from '../cameraDiagnostics.js';
import {CameraDiagnostics} from './CameraDiagnostics.jsx';
import {SessionNotice} from './SessionNotice.jsx';

export function CameraObserver({video,stream,activity='idle',inquiryTarget}){
  const [enabled,setEnabled]=useState(false),[result,setResult]=useState({state:'off'}),[message,setMessage]=useState('');
  const [mode,setMode]=useState('auto'),[seconds,setSeconds]=useState(15),[paused,setPaused]=useState(false);
  const [reminders]=useState(()=>createCameraReminderGate());
  const [diagnostics]=useState(()=>createCameraDiagnostics());
  const reminderState=useSyncExternalStore(reminders.subscribe,reminders.getSnapshot);
  const settings=observationSettings(activity,mode,seconds);
  const policy=useMemo(()=>createPresencePolicy(observationSettings(activity,mode,seconds)),[activity,mode,seconds]);
  useEffect(()=>{
    if(!enabled||!stream||paused)return;
    let active=true;policy.reset();
    const commit=value=>{if(active)setResult({...value,source:stream,policy});};
    const session=createCameraInference({kind:'face',video:()=>video.current,stream,interval:250,diagnostics,
      onResult:({count,durationMs,timestamp})=>{
        const next=policy.observe(count,timestamp);commit({...next,durationMs});
        if(next.remind){const ticket=reminders.request(policy,'presence');if(ticket!==null)setMessage({source:stream,policy,ticket,text:'镜头持续未检测到人脸。需要休息，还是调整一下摄像头位置？'});}
        else if(next.state!=='no-face'){reminders.dismiss(policy);setMessage('');}
      },
      onStatus:value=>{policy.reset();reminders.dismiss(policy);commit(value);setMessage('');},
    });
    return()=>{active=false;session.dispose();policy.reset();reminders.dismiss(policy);};
  },[enabled,stream,policy,video,paused,reminders,diagnostics]);
  const state=!enabled?'off':!stream?'camera-off':paused?'paused':result.source!==stream||result.policy!==policy?'loading':result.state;
  return <section className="camera-observer" aria-label="摄像头本机监督" data-observation={state} data-profile={settings.profile}>
    <h3>本机在场观察</h3><label><input aria-label="开启本机在场观察" type="checkbox" checked={enabled} onChange={event=>{setEnabled(event.target.checked);setPaused(false);setResult({state:'off'});setMessage('');}}/>开启本机在场观察</label>
    <div className="observation-options">
      <label>观察方式<select aria-label="观察方式" value={mode} onChange={event=>setMode(event.target.value)}><option value="auto">跟随当前场景</option><option value="desk">坐定活动：离开镜头时提醒</option><option value="mobile">移动活动：只显示状态</option></select></label>
      <label>离开镜头多久再提醒<select aria-label="离开镜头提醒等待时间" value={seconds} disabled={!settings.reminders} onChange={event=>setSeconds(Number(event.target.value))}>{[15,30,60,120].map(value=><option key={value} value={value}>{value} 秒</option>)}</select></label>
    </div>
    <p className="form-hint">当前场景：{settings.label}。{settings.reminders?`连续 ${seconds} 秒未见人脸后询问，提醒间隔至少 2 分钟。`:'移动／休息场景允许离开镜头，只显示检测状态，不发离开提醒。'}</p>
    <button disabled={!enabled||!stream} onClick={()=>{setPaused(value=>!value);setResult({state:'off'});setMessage('');}}>{paused?'恢复观察':'暂时休息，暂停观察'}</button>
    <div className="camera-reminder-summary"><p>三种观察共用至少 2 分钟的询问间隔，同一面板最多显示一条询问。</p><button disabled={!enabled||!stream} onClick={()=>reminders.snooze()}>所有摄像头询问暂缓 2 分钟</button>{reminderState.snoozed&&<p role="status">已统一暂缓摄像头询问 2 分钟，观察和专注计时继续。</p>}</div>
    <p role="status">{({off:'观察已关闭',paused:'正在休息，检测已暂停；摄像头预览仍开启。恢复后重新计算等待时间。',loading:'正在加载本机检测模型…','camera-off':'请先开启摄像头，当前无法观察。',present:'检测到一张人脸，仅表示画面中有人。',multiple:'检测到多张人脸，无法确定用户状态。','no-face':`未检测到人脸 · ${result.seconds||0} 秒`,unknown:'当前画面不可用，无法观察。',unavailable:'本机检测不可用，请检查本地模型后重新开启。'})[state]}</p>
    {result.source===stream&&result.policy===policy&&enabled&&!paused&&Number.isFinite(result.durationMs)&&<p className="form-hint" data-inference="worker">在场模型在本机后台线程运行 · 最近推理 {Math.round(result.durationMs)} 毫秒</p>}
    {message?.source===stream&&message.policy===policy&&enabled&&stream&&!paused&&(message.corrected||reminderState.active?.ticket===message.ticket)&&<SessionNotice target={inquiryTarget}><p className="status-notice" role="status" data-camera-inquiry={message.corrected?undefined:'presence'}>{message.text}{!message.corrected&&<button onClick={()=>{if(!reminders.correct(policy,message.ticket))return;policy.correct(performance.now());setMessage({source:stream,policy,corrected:true,text:'已记下：你仍在任务中，三种摄像头询问统一暂缓 2 分钟。'});}}>我仍在任务中</button>}</p></SessionNotice>}
    <TaskPostureObserver key={activity} video={video} stream={stream} available={enabled&&!paused&&settings.reminders} seconds={seconds} reminders={reminders} activeReminder={reminderState.active} diagnostics={diagnostics} inquiryTarget={inquiryTarget}/>
    <TaskObjectObserver key={`objects-${activity}`} video={video} stream={stream} available={enabled&&!paused&&settings.reminders} seconds={seconds} reminders={reminders} activeReminder={reminderState.active} diagnostics={diagnostics} inquiryTarget={inquiryTarget}/>
    <CameraDiagnostics diagnostics={diagnostics}/>
    <p className="form-hint">画面只在本机处理，不保存截图、不识别身份、不上传。遮挡、低光或离开画面不能证明你没有完成任务。不会自动改任务或专注统计。以上设置仅用于当前页面；暂停观察不暂停专注计时，关闭摄像头请使用设备按钮。</p>
  </section>;
}

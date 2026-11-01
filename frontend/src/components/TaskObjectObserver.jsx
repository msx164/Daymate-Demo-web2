import {useEffect,useMemo,useRef,useState} from 'react';
import {createCameraInference} from '../cameraInference.js';
import {createObjectObservationPolicy,TASK_OBJECTS,OBJECT_SCORE_PROFILES} from '../objectObservation.js';
import {captureCameraRegion,normalizeCameraRegion} from '../cameraRegion.js';
import {ObjectObservationRegion} from './ObjectObservationRegion.jsx';
import {createCameraObjectCheck} from '../cameraObjectCheck.js';
import {CameraObjectCheck} from './CameraObjectCheck.jsx';
import {CameraInferenceNotice} from './CameraInferenceNotice.jsx';
import {SessionNotice} from './SessionNotice.jsx';

export function TaskObjectObserver({video,stream,available,seconds,reminders,activeReminder,diagnostics,inquiryTarget}){
  const [enabled,setEnabled]=useState(false),[noPhone,setNoPhone]=useState(false),[result,setResult]=useState({}),[notice,setNotice]=useState(null);
  const [region,setRegion]=useState(()=>normalizeCameraRegion(null));
  const [profile,setProfile]=useState('standard');
  const [attempt,setAttempt]=useState(0);
  const threshold=OBJECT_SCORE_PROFILES[profile].threshold;
  const [check]=useState(()=>createCameraObjectCheck());
  const policy=useMemo(()=>enabled&&available&&stream?createObjectObservationPolicy():null,[enabled,available,stream]);
  const configuration=useMemo(()=>({noPhone,seconds,region,threshold}),[noPhone,seconds,region,threshold]);
  const checkContext=useMemo(()=>({policy,configuration,attempt}),[policy,configuration,attempt]),current=useRef({value:configuration,appliedAt:0,checkContext});
  useEffect(()=>{check.cancel('interrupted');current.current={value:configuration,appliedAt:performance.now(),checkContext};policy?.configure({phoneReminders:configuration.noPhone,absentMs:configuration.seconds*1000,threshold:configuration.threshold});if(policy)reminders.dismiss(policy);},[policy,configuration,reminders,check,checkContext]);
  useEffect(()=>{
    if(!policy)return;
    let active=true;
    const commit=value=>{if(!active)return;setResult({...value,policy,attempt,configuration:current.current.value});if(value.remind){const ticket=reminders.request(policy,'objects');if(ticket!==null)setNotice({policy,ticket,configuration:current.current.value});}else if(value.state!=='phone-visible'){setNotice(null);reminders.dismiss(policy);}};
    const session=createCameraInference({kind:'objects',video:()=>video.current,stream,interval:1000,diagnostics,
      capture:element=>captureCameraRegion(element,current.current.value.region),
      onResult:({objects,timestamp,durationMs})=>{if(timestamp>=current.current.appliedAt){const next=policy.observe(objects,timestamp);commit({...next,durationMs});check.observe({...next,timestamp,context:current.current.checkContext,threshold:current.current.value.threshold,region:current.current.value.region,width:video.current?.videoWidth,height:video.current?.videoHeight});}},
      onStatus:value=>{policy.reset();check.cancel('interrupted');commit(value);},
    });
    return()=>{active=false;session.dispose();policy.reset();reminders.dismiss(policy);check.cancel('interrupted');};
  },[policy,video,stream,reminders,check,attempt,diagnostics]);
  const fresh=result.policy===policy&&result.attempt===attempt&&result.configuration===configuration;
  const state=!enabled?'off':!available||!stream?'paused':result.policy!==policy||result.attempt!==attempt?'loading':result.state==='unavailable'?'unavailable':!fresh?'updating':result.state;
  const visible=notice?.policy===policy&&notice.configuration===configuration&&activeReminder?.ticket===notice?.ticket&&noPhone&&enabled&&available&&stream;
  return <section className="task-objects" aria-label="任务物体线索" data-objects={state}>
    <h4>任务物体线索 · 试用</h4>
    <label><input type="checkbox" aria-label="开启任务物体线索" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setNotice(null);}}/>识别画面中的手机、书本和笔记本电脑</label>
    <p className="form-hint">请让需要观察的桌面和物体进入镜头。物体可见不代表正在使用；没检测到也不代表物体不存在。</p>
    <div className="observation-options"><label>物体识别灵敏度<select aria-label="物体识别灵敏度" value={profile} onChange={e=>setProfile(e.target.value)}>{Object.entries(OBJECT_SCORE_PROFILES).map(([key,item])=><option key={key} value={key}>{item.label}（{item.threshold.toFixed(2)}）</option>)}</select></label></div>
    <p className="form-hint">低阈值可能识别出更多线索，也可能增加误检；高阈值可能减少误检，也可能漏检。请用下方自检对照当前区域。切换档位保留模型和冷却，重新计算持续时间。</p>
    {enabled&&available&&stream&&<ObjectObservationRegion stream={stream} region={region} onChange={setRegion}/>}
    <label><input type="checkbox" aria-label="此次任务不需要手机" checked={noPhone} onChange={e=>setNoPhone(e.target.checked)}/>此次任务不需要手机，持续可见时询问</label>
    <p role="status">{({off:'物体观察已关闭。',paused:'请开启摄像头和坐定场景的在场观察；移动／休息场景暂停物体观察。',loading:'正在加载本机物体模型…',updating:'设置已改变，等待所选区域的新画面…',observing:result.objects?.length?'在所选区域检测到以下可见线索：':'本帧所选区域未检测到目标物体，不能据此判断任务状态。','phone-visible':`手机在所选区域持续可见 · ${result.seconds||0} 秒`,unknown:'当前画面或推理结果不可用，不累计手机可见时间。',unavailable:'物体检测已停止，可在下方重新加载；其他观察不受影响。'})[state]}</p>
    <CameraInferenceNotice state={state} reason={result.reason} onRetry={()=>{setNotice(null);setAttempt(value=>value+1);}}/>
    {policy&&fresh&&result.objects?.length>0&&<ul className="object-evidence">{result.objects.map(item=><li key={item.label}>{TASK_OBJECTS[item.label]} · 模型分数 {item.score.toFixed(2)}</li>)}</ul>}
    {policy&&fresh&&Number.isFinite(result.durationMs)&&<p className="form-hint" data-object-inference="worker">物体模型在本机后台线程运行 · 最近推理 {Math.round(result.durationMs)} 毫秒</p>}
    <CameraObjectCheck check={check} context={checkContext} ready={!!policy&&fresh&&['observing','phone-visible'].includes(state)}/>
    {visible&&<SessionNotice target={inquiryTarget}><div className="object-notice" role="status" data-camera-inquiry="objects"><p>手机已持续出现在画面中。它是否用于当前任务？这不是使用手机或分心的结论。</p><button onClick={()=>{if(!reminders.correct(policy,notice.ticket))return;policy.correct(performance.now());setNotice(null);}}>我仍在任务中，统一暂缓询问</button><button onClick={()=>{if(!reminders.correct(policy,notice.ticket))return;setNoPhone(false);setNotice(null);}}>本次任务需要手机，关闭手机询问</button></div></SessionNotice>}
    <p className="form-hint">手机询问默认关闭；启用后至少连续 {seconds} 秒、多次检测到才询问，间隔至少 2 分钟。书本或电脑只显示线索，不提醒缺失、不确认任务完成。画面只在本机处理，不保存、不上传；模型分数不等于实际准确率。</p>
  </section>;
}

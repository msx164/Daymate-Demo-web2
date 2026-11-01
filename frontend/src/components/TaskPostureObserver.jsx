import {useEffect,useMemo,useRef,useState} from 'react';
import {createTaskPosturePolicy,rotationFromMatrix,POSTURE_PROFILES} from '../taskPosture.js';
import {addObservationFeedback,observationFeedbackSummary,OBSERVATION_FEEDBACK_REASONS} from '../observationFeedback.js';
import {createCameraInference} from '../cameraInference.js';
import {SessionNotice} from './SessionNotice.jsx';

export function TaskPostureObserver({video,stream,available,seconds,reminders,activeReminder,diagnostics,inquiryTarget}) {
  const [enabled,setEnabled]=useState(false),[result,setResult]=useState({}),[notice,setNotice]=useState(false);
  const [profile,setProfile]=useState('standard'),[feedback,setFeedback]=useState([]),[reason,setReason]=useState('task');
  const policy=useMemo(()=>enabled&&available&&stream?createTaskPosturePolicy():null,[stream,available,enabled]);
  const configuration=useMemo(()=>({seconds,profile}),[seconds,profile]),currentConfiguration=useRef({value:configuration,appliedAt:0});
  useEffect(()=>{currentConfiguration.current={value:configuration,appliedAt:performance.now()};policy?.configure({absentMs:configuration.seconds*1000,profile:configuration.profile});if(policy)reminders.dismiss(policy);},[policy,configuration,reminders]);
  useEffect(()=>{
    if(!enabled||!available||!stream)return;
    let active=true;
    const commit=value=>{if(active){setResult({...value,policy});if(value.remind){const ticket=reminders.request(policy,'posture');if(ticket!==null)setNotice({policy,ticket,configuration:currentConfiguration.current.value});}else if(value.state!=='deviating'){setNotice(false);reminders.dismiss(policy);}}};
    const session=createCameraInference({kind:'posture',video:()=>video.current,stream,diagnostics,
      onResult:({count,matrix,durationMs,timestamp})=>{if(timestamp>=currentConfiguration.current.appliedAt)commit({...policy.observe(rotationFromMatrix({data:matrix}),count,timestamp),durationMs});},
      onStatus:value=>{policy.reset();commit(value);},
    });
    return()=>{active=false;session.dispose();policy.reset();reminders.dismiss(policy);};
  },[enabled,available,stream,policy,video,reminders,diagnostics]);
  const state=!enabled?'off':!available||!stream?'paused':result.policy!==policy?'loading':result.state;
  const canCalibrate=['aligned','uncalibrated','deviating','calibration-failed'].includes(state);
  const labels={screen:'屏幕',book:'书本／桌面'};
  const summary=observationFeedbackSummary(feedback),thresholds=POSTURE_PROFILES[profile];
  const activeNotice=notice?.policy===policy&&notice?.configuration===configuration&&activeReminder?.ticket===notice?.ticket;
  function reportFeedback(){
    if(!activeNotice||!policy||!reminders.correct(policy,notice.ticket))return;
    setFeedback(entries=>addObservationFeedback(entries,reason));
    policy.correct(performance.now());setNotice(false);
  }
  return <section className="task-posture" aria-label="任务姿态观察" data-posture={state}>
    <h4>任务姿态观察 · 试用</h4>
    <label><input type="checkbox" aria-label="开启任务姿态观察" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setNotice(false);}}/>观察持续偏离正常任务姿态</label>
    <div className="observation-options"><label>姿态容忍度<select aria-label="姿态容忍度" value={profile} onChange={e=>setProfile(e.target.value)}>{Object.entries(POSTURE_PROFILES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label></div>
    <p className="form-hint">{thresholds.enter}° 以上开始计算偏离，回到 {thresholds.exit}° 以内清零。多屏工作可先尝试宽松档；改变档位和等待时间保留校准，重新计算持续偏离时间。</p>
    <p className="form-hint">先保持正常看屏幕的姿势校准；看书时再添加低头姿势。每次稳定约 3 秒。两个姿态均视为正常，摄像头换位置后请重新校准。</p>
    <div className="posture-actions">{Object.entries(labels).map(([slot,label])=><button key={slot} disabled={!canCalibrate} onClick={()=>{policy.calibrate(slot,performance.now());reminders.dismiss(policy);setNotice(false);setResult({state:'calibrating',policy});}}>校准{label}</button>)}</div>
    <p role="status">{({off:'任务姿态观察已关闭。',paused:'请先开启摄像头和坐定场景的在场观察；休息或移动场景中暂停。',loading:'正在加载本机姿态模型…',uncalibrated:'模型已就绪，请先校准正常任务姿态。',calibrating:`保持自然姿势… ${result.samples||0}/6`,aligned:'头部朝向接近已校准的任务姿态。',deviating:`头部朝向偏离已校准姿态 · ${result.seconds||0} 秒`,unknown:'无法可靠观察单人姿态，等待有效画面；未据此判断分心。','calibration-failed':'姿态不够稳定，请重新校准。',unavailable:'姿态模型不可用，请重新开启；原有在场观察仍可使用。'})[state]}</p>
    {result.policy===policy&&enabled&&available&&stream&&Number.isFinite(result.durationMs)&&<p className="form-hint" data-inference="worker">姿态模型在本机后台线程运行 · 最近推理 {Math.round(result.durationMs)} 毫秒</p>}
    {result.policy===policy&&result.zones?.length>0&&<div className="posture-zones"><p>已校准：{result.zones.map(key=>labels[key]).join('、')}</p>{result.zones.map(slot=><button key={slot} disabled={!canCalibrate} aria-label={`移除${labels[slot]}校准`} onClick={()=>{const zones=policy.remove(slot);reminders.dismiss(policy);setNotice(false);setResult({policy,state:zones.length?'unknown':'uncalibrated',zones});}}>移除{labels[slot]}校准</button>)}</div>}
    {activeNotice&&enabled&&available&&stream&&<SessionNotice target={inquiryTarget}><div className="posture-notice" role="status" data-camera-inquiry="posture"><p>你持续偏离了校准时的头部朝向。是在继续任务，还是需要休息？</p><label>这次提醒是否有帮助<select aria-label="姿态提醒反馈原因" value={reason} onChange={e=>setReason(e.target.value)}>{Object.entries(OBSERVATION_FEEDBACK_REASONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button onClick={reportFeedback}>记录反馈，统一暂缓询问</button></div></SessionNotice>}
    <details className="observation-feedback"><summary>本页提醒反馈 · {summary.total} 条</summary><p>你主动确认的最近 50 条：仍在任务中／无需提醒 {summary.unnecessary} 次，需要休息 {summary.counts.break} 次。该结果不是自动识别准确率或专注率。</p>{feedback.length>0&&<><ul>{Object.entries(OBSERVATION_FEEDBACK_REASONS).map(([key,label])=><li key={key}>{label}：{summary.counts[key]} 次</li>)}</ul><button onClick={()=>setFeedback([])}>清空本页提醒反馈</button></>}<p className="form-hint">只在此页面内存中保留反馈原因和点击时间；离开页面后清除，不写数据库、不上传，也不调整任务或计时。</p></details>
    <p className="form-hint">持续偏离 {seconds} 秒才询问，至少间隔 2 分钟。只比较头部朝向，不测量视线，也不识别手机、书本或任务完成情况。校准仅留在本次观察内，暂停／场景切换后重做；画面不保存、不上传。</p>
  </section>;
}

import { userStorage } from '../web2/session.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createVoiceTurn, decodeVoice } from '../voiceTurn.js';
import { useConversation } from '../companionConversation.js';
import { watchVoicePause } from '../voiceEndpoint.js';
import { useContinuousVoice } from '../hooks/useContinuousVoice.js';
import { VOICE_TIMINGS, voiceTiming, readVoiceTiming, saveVoiceTiming } from '../voiceTiming.js';

export function VoiceControls({ stream }) {
  const {chat,speech}=useConversation(), pending=useRef(null);
  const {cancel:cancelChat}=chat, {stop:stopSpeech,speak:speakReply}=speech;
  const [status,setStatus]=useState(null),[notice,setNotice]=useState('');
  const [autoEnd,setAutoEnd]=useState(false),[sensitivity,setSensitivity]=useState('normal');
  const [continuousMode,setContinuousMode]=useState(false);
  const [duplex,setDuplex]=useState(false);
  const [sentenceSpeech,setSentenceSpeech]=useState(false);
  const [timing,setTiming]=useState(()=>{try{return readVoiceTiming(userStorage('local'));}catch{return 'normal';}});
  const bridge=window.daymateDesktop;
  const [turn]=useState(()=>createVoiceTurn({
    makeRecorder:source=>new MediaRecorder(source,{mimeType:'audio/webm;codecs=opus'}),decode:decodeVoice,
    transcribe:pcm=>bridge.transcribePCM(pcm),cancelASR:()=>bridge?.cancelASR?.(),
    interrupt:async()=>{},
    watchPause:watchVoicePause,
  }));
  const voice=useSyncExternalStore(turn.subscribe,turn.getSnapshot);
  const continuous=useContinuousVoice(turn,chat,speech), loop=continuous.controller;
  useEffect(()=>{
    let active=true;
    bridge?.getASRStatus?.().then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setStatus({available:false});});
    const stop=()=>{loop.stop();turn.cancel();if(pending.current!==null){cancelChat();pending.current=null;}void stopSpeech();};
    const visibility=()=>{if(document.hidden)stop();};
    const unsubscribe=bridge?.onVisibility?.(visible=>{if(!visible)stop();});
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
    return()=>{active=false;unsubscribe?.();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);stop();};
  },[bridge,cancelChat,stopSpeech,turn,loop]);
  useEffect(()=>{if(!stream){loop.stop();turn.cancel();}},[stream,turn,loop]);
  useEffect(()=>{
    if(pending.current===null)return;
    const reply=chat.messages.find(message=>message.id===pending.current);
    if(!reply||['error','cancelled'].includes(reply.status)||chat.messages.at(-1)?.id!==pending.current){pending.current=null;return;}
    if(reply.status==='complete'&&!chat.busy){pending.current=null;void speakReply(reply);}
  },[chat.messages,chat.busy,speakReply]);
  function send(){
    if(chat.busy||!voice.text.trim())return;
    if(chat.submit(voice.text.trim())){pending.current=chat.getSnapshot().messages.at(-1).id;turn.edit('');setNotice('文字已发送；完整回复将使用已选本地声音朗读。');}
  }
  function cancel(){loop.stop();turn.cancel();if(pending.current!==null)chat.cancel();pending.current=null;void speech.stop();setNotice('已取消，连续对话也已停止；未发送的语音文字不会自动发送。');}
  const active=['preparing','recording','recognizing'].includes(voice.phase);
  const effectiveAutoEnd=autoEnd||continuousMode;
  const phaseLabels={preparing:'正在准备本轮采集…',listening:'请说话，停顿后会自动识别并发送。',recognizing:'本机识别中…',sending:'正在发送识别文字…',replying:'Day 正在回复…',segmented:'Day 正在边生成边分句朗读；全部结束后接听下一轮。',playbackPending:'正在准备朗读…',speaking:duplex?'Day 正在朗读，你可以说话打断。':'Day 正在朗读，自然结束后接听下一轮；手动停止会结束对话。',interrupting:'已打断 Day，正在接收你这段话…',cooldown:'朗读完成，稍后等待下一句话…'};
  return <section className="voice-controls" aria-label="本机语音对话" data-phase={voice.phase} data-continuous={continuous.active} data-conversation-phase={continuous.phase}>
    <h3>和 Day 说话</h3>
    <p className="form-hint">默认核对文字后发送。开启连续对话后，识别文字与近期对话将自动发送给已配置模型。</p>
    <label className="continuous-option"><input aria-label="连续对话（自动发送识别文字）" type="checkbox" checked={continuousMode} disabled={active&&!continuous.active} onChange={event=>{loop.stop();setContinuousMode(event.target.checked);}} />连续对话（自动发送识别文字）</label>
    <details className="voice-settings"><summary>语音偏好</summary>
    {continuousMode&&<label className="continuous-option"><input aria-label="允许说话打断 Day" type="checkbox" checked={duplex} disabled={continuous.active} onChange={event=>setDuplex(event.target.checked)}/>允许说话打断 Day（朗读时同时收音，建议耳机）</label>}
    {continuousMode&&<><label className="continuous-option"><input aria-label="分句朗读（生成一句读一句）" type="checkbox" checked={sentenceSpeech} disabled={continuous.active} onChange={event=>setSentenceSpeech(event.target.checked)} />分句朗读（生成一句读一句）</label>
      {sentenceSpeech&&<p className="form-hint">会朗读尚未生成完的回复；中途失败不能撤回已说出的句子。按句排队，不朗读代码块；取消或打断会清空未播内容。关闭此项恢复完整回复后朗读。</p>}</>}
    </details><div className="voice-actions">
      {continuousMode ? <>
        <button disabled={!status?.available||!stream||!chat.status?.configured||!speech.supported||speech.loading||continuous.active||active} onClick={()=>{pending.current=null;setNotice('');void loop.start(stream,sensitivity,{duplex,timing,sentenceSpeech});}}>开始连续对话</button>
        <button disabled={!continuous.active} onClick={()=>loop.stop()}>停止连续对话</button>
        {voice.phase==='recording'&&<button onClick={turn.finish}>结束本段并发送</button>}
      </> : voice.phase==='recording'?<button onClick={turn.finish}>结束并识别</button>:<button disabled={!status?.available||!stream||active} onClick={()=>{setNotice('');void turn.start(stream,async()=>{pending.current=null;chat.cancel();await speech.stop();await speech.loadVoices();},{autoEnd,sensitivity,timing});}}>开始说话／打断回复</button>}
      {(active||continuous.active||speech.phase==='speaking'||chat.busy)&&<button onClick={cancel}>取消语音与回复</button>}
    </div>
    <details className="voice-settings"><summary>识别与接话节奏</summary><div className="voice-endpoint-options"><label><input aria-label="停顿后自动识别" type="checkbox" checked={effectiveAutoEnd} disabled={active||continuousMode} onChange={event=>setAutoEnd(event.target.checked)} />停顿后自动识别</label>
      <label>接话节奏 <select aria-label="接话节奏" value={timing} disabled={active||continuous.active} onChange={event=>{
        const value=event.target.value;setTiming(value);
        try{if(!saveVoiceTiming(userStorage('local'),value))setNotice('接话节奏本次有效，但未能保存。');else setNotice('接话节奏已保存；不会自动开启采集。');}catch{setNotice('接话节奏本次有效，但未能保存。');}
      }}>{Object.entries(VOICE_TIMINGS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
      <label>声音检测灵敏度 <select aria-label="声音检测灵敏度" value={sensitivity} disabled={active||continuous.active} onChange={event=>setSensitivity(event.target.value)}><option value="sensitive">较高（轻声）</option><option value="normal">正常</option><option value="conservative">较低（背景较吵）</option></select></label></div>
    {effectiveAutoEnd&&<p className="form-hint">持续声音后停顿约 {voiceTiming(timing).silenceMs/1000} 秒会结束本段；朗读结束后等待 {voiceTiming(timing).cooldownMs/1000} 秒再接话。8 秒未检测到持续声音则停止。快速模式可能切断句中停顿，可切换从容模式。按音量判断，环境噪声也可能触发。{continuousMode?'连续模式会自动发送识别文字，请在合适的环境开启。':'识别文字仍需核对并手动发送。'}</p>}
    </details>{voice.phase==='recording'&&effectiveAutoEnd&&<div className="voice-input-level"><meter aria-label="麦克风输入音量" min="0" max="1" value={voice.level} /><span role="status">{({waiting:'等待持续声音',sound:'检测到声音',pause:'等待停顿结束',unavailable:'检测不可用，请手动结束'})[voice.endpoint]||'等待声音'}</span></div>}
    <p role="status">{continuous.active?phaseLabels[continuous.phase]:!bridge?.transcribePCM?'语音识别在 Windows 源码桌面 Demo 中可用。':!status?'正在检查离线识别…':!status.available?'离线语音模型尚未准备，请先运行准备脚本。':({idle:continuousMode?'点击开始连续对话后才会采集和自动发送。':'请先开启麦克风，再点击开始说话。',preparing:'正在停止朗读并准备采集…',recording:'正在采集语音，结束后进行本机识别。',recognizing:'本机识别中…',ready:'识别结束，请核对文字后发送。'})[voice.phase]}</p>
    {(continuous.lastUser||continuous.lastReply)&&<div className="voice-captions" role="log" aria-label="连续对话字幕" aria-live="off"><p><strong>你：</strong>{continuous.lastUser}</p><p><strong>Day：</strong>{continuous.lastReply||'正在回复…'}</p></div>}
    {voice.elapsed!==null&&<details className="voice-diagnostics"><summary>识别详情</summary><p className="form-hint">本机识别耗时：{(voice.elapsed/1000).toFixed(2)} 秒；{voice.warm?'复用已加载的识别模型':voice.modelLoadMs!==null?`本次模型加载 ${(voice.modelLoadMs/1000).toFixed(2)} 秒`:'使用本机识别'}。</p></details>}
    {!continuousMode&&<><label>语音文字<textarea aria-label="语音识别文字" rows={2} maxLength={4000} value={voice.text} disabled={active||continuous.active} onChange={event=>turn.edit(event.target.value)} /></label>
    <button className="primary-button" disabled={active||continuous.active||chat.busy||!chat.status?.configured||!voice.text.trim()} onClick={send}>发送文字并朗读回复</button></>}
    {!chat.status?.configured&&<p className="form-hint">聊天模型尚未配置，可先测试本机识别；配置好后再发送。</p>}
    {(continuous.error||voice.error||speech.error||chat.error)&&<p className="form-error" role="alert">{continuous.error||voice.error||speech.error||chat.error}</p>}
    {voice.endpointWarning&&<p className="form-hint" role="status">{voice.endpointWarning}</p>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

import { voiceTiming } from './voiceTiming.js';
// Serial half-duplex conversation: listen -> recognize -> send -> speak -> listen.
// Subscriptions live outside React effects so a transcript can be consumed only once.
export function createContinuousVoice({turn,chat,speech,sentencePlayer,canContinue,watchDuplex,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let view={active:false,phase:'off',error:'',turns:0,lastUser:'',lastReply:''};
  let revision=0,stream,sensitivity='normal',replyId=null,timer,unsubscribers=[],pumping=false,duplex=false,duplexMonitor=null;
  let timing='normal',sentenceMode=false;
  const listeners=new Set();
  const emit=patch=>{view={...view,...patch};listeners.forEach(fn=>fn());};
  const alive=()=>stream?.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled);
  function stop(error='') {
    revision++;clearTimer(timer);
    duplexMonitor?.stop();duplexMonitor=null;
    const wasActive=view.active;
    emit({active:false,phase:'off',error});
    sentencePlayer?.stop();
    if(wasActive){turn.cancel();if(replyId!==null&&chat.getSnapshot().busy&&chat.getSnapshot().messages.at(-1)?.id===replyId)chat.cancel();void speech.stop();}
    replyId=null;stream=null;
  }
  async function allowed(current){
    try{return current===revision&&view.active&&alive()&&await canContinue()&&current===revision&&view.active&&alive();}catch{return false;}
  }
  async function listen(current){
    if(!await allowed(current)){if(current===revision)stop('设备或窗口不可用，连续对话已停止。');return;}
    emit({phase:'preparing'});
    await turn.start(stream,async()=>{}, {autoEnd:true,sensitivity,timing});
    if(current!==revision||!view.active)return;
    emit({phase:'listening'});pump();
  }
  async function send(text,current){
    if(!await allowed(current)){if(current===revision)stop('窗口或设备已不可用，未自动发送本段文字。');return;}
    if(!chat.submit(text)){stop('消息未能发送，连续对话已停止；可改用文字。');return;}
    replyId=chat.getSnapshot().messages.at(-1)?.id;
    turn.edit('');
    if(sentenceMode) sentencePlayer.start(replyId);
    emit({phase:sentenceMode?'segmented':'replying',lastUser:text,lastReply:'',turns:view.turns+1});pump();
  }
  async function read(reply,current){
    if(!await allowed(current)){if(current===revision)stop('窗口或设备已不可用，连续对话已停止。');return;}
    emit({phase:'speaking'});
    const accepted=await speech.speak(reply);
    if(current!==revision||!view.active)return;
    if(!accepted){stop('本地朗读不可用，已保留文字回复。');return;}
    pump();
  }
  function startDuplex(){
    if(!duplex||!watchDuplex||duplexMonitor)return;
    const current=revision;
    try{duplexMonitor=watchDuplex(stream,{sensitivity,timing,
      onSpeech:()=>{
        if(current!==revision||!view.active)return;
        emit({phase:'interrupting'});
        sentencePlayer?.stop();
        if(chat.getSnapshot().busy&&chat.getSnapshot().messages.at(-1)?.id===replyId)chat.cancel();
        void speech.stop();
      },
      onPCM:async pcm=>{
        duplexMonitor=null;
        if(!await allowed(current)){if(current===revision)stop('窗口或设备已关闭，同时收音已停止。');return;}
        emit({phase:'bargePreparing'});void turn.recognizePCM(pcm);emit({phase:'recognizing'});pump();
      },
      onError:error=>{if(current===revision)stop(error);},
    });}catch{stop('同时收音未能启动，请改用轮流对话。');}
  }
  function pump(){
    if(pumping||!view.active)return;pumping=true;
    try{
      if(!alive()){stop('麦克风已关闭，连续对话已停止。');return;}
      const voice=turn.getSnapshot(),conversation=chat.getSnapshot(),audio=speech.getSnapshot();
      if(['listening','recognizing','cooldown'].includes(view.phase)&&(['starting','speaking'].includes(audio.phase)||conversation.busy)){
        stop('检测到其他生成或朗读，连续对话已停止。');return;
      }
      if(view.phase==='cooldown'&&audio.outcome==='cancelled'){stop('朗读已停止，连续对话已结束。');return;}
      if(['listening','recognizing'].includes(view.phase)){
        if(voice.error||voice.endpointWarning){stop(voice.error||voice.endpointWarning);return;}
        if(voice.phase==='idle'){stop('采集已停止，连续对话已结束。');return;}
        if(voice.phase==='recognizing')emit({phase:'recognizing'});
        if(voice.phase==='ready'){
          const text=voice.text.trim();if(!text){stop('未识别到清晰语音，连续对话已停止。');return;}
          emit({phase:'sending'});void send(text,revision);
        }
      }else if(view.phase==='segmented'){
        startDuplex();
        const reply=conversation.messages.find(message=>message.id===replyId),queue=sentencePlayer.getSnapshot();
        if(!reply||conversation.messages.at(-1)?.id!==replyId||['error','cancelled'].includes(reply.status)||queue.error){
          stop(queue.error||conversation.error||'回复被中断，分句朗读已停止。');return;
        }
        if(reply.content!==view.lastReply)emit({lastReply:reply.content});
        if(queue.phase==='complete'&&queue.completedId===replyId&&reply.status==='complete'&&!conversation.busy){
          duplexMonitor?.stop();duplexMonitor=null;
          emit({phase:'cooldown'});const current=revision;timer=setTimer(()=>{if(view.active&&current===revision)void listen(current);},voiceTiming(timing).cooldownMs);
        }else if(!queue.active){stop('分句朗读已停止，连续对话已结束。');}
      }else if(view.phase==='replying'){
        startDuplex();
        const reply=conversation.messages.find(message=>message.id===replyId);
        if(!reply||conversation.messages.at(-1)?.id!==replyId||['error','cancelled'].includes(reply.status)){stop(conversation.error||'回复被中断，连续对话已停止。');return;}
        if(reply.content!==view.lastReply)emit({lastReply:reply.content});
        if(reply.status==='complete'&&!conversation.busy){emit({phase:'playbackPending',lastReply:reply.content});void read(reply,revision);}
      }else if(view.phase==='speaking'){
        startDuplex();
        if(audio.error||audio.phase==='error'){stop(audio.error||'朗读失败，连续对话已停止。');return;}
        if(audio.outcome==='completed'&&audio.completedId===replyId){
          duplexMonitor?.stop();duplexMonitor=null;
          emit({phase:'cooldown'});const current=revision;timer=setTimer(()=>{if(view.active&&current===revision)void listen(current);},voiceTiming(timing).cooldownMs);
        }else if(audio.outcome==='cancelled'||(['starting','speaking'].includes(audio.phase)&&audio.playingId!==replyId))stop('朗读已停止或切换，连续对话已结束。');
        else if(audio.phase==='idle')stop('未确认朗读自然完成，请从托盘完整退出并重新启动 Demo 后重试。');
      }
    }finally{pumping=false;}
  }
  return {
    getSnapshot:()=>view,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    connect(){if(!unsubscribers.length){sentencePlayer?.connect();unsubscribers=[turn.subscribe(pump),chat.subscribe(pump),speech.subscribe(pump),...(sentencePlayer?[sentencePlayer.subscribe(pump)]:[])];}},
    async start(source,level='normal',options={}){
      stop();stream=source;sensitivity=level;timing=options.timing||'normal';duplex=options.duplex===true;sentenceMode=options.sentenceSpeech===true;const current=++revision;
      emit({active:true,phase:'preparing',error:'',turns:0,lastUser:'',lastReply:''});
      if(!chat.getSnapshot().status?.configured){stop('请先配置并检查聊天模型。');return;}
      if(sentenceMode&&(!sentencePlayer||!speech.speakSegment)){stop('分句朗读不可用，请关闭该选项后使用完整回复朗读。');return;}
      chat.cancel();await speech.stop();await speech.loadVoices();
      if(current!==revision||!view.active)return;
      const audio=speech.getSnapshot();if(audio.error||!audio.voice){stop(audio.error||'请先准备 Windows 本地声音。');return;}
      await listen(current);
    },
    stop,
    dispose(){stop();unsubscribers.forEach(unsubscribe=>unsubscribe());unsubscribers=[];sentencePlayer?.dispose();},
  };
}

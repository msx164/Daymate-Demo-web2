import { useEffect, useRef, useState } from "react";
import { useConversation } from '../companionConversation.js';
import { TaskChatContext } from "./TaskChatContext.jsx";
import { composeChatMessage, taskContextPreview } from "../taskChatContext.js";
import { AiTaskPlanner } from "./AiTaskPlanner.jsx";
import { CompanionLibrary } from "./CompanionLibrary.jsx";
import { preferencePreview, withPreferences } from "../companionPreferences.js";
import { CompanionAvatar } from "./CompanionAvatar.jsx";
import { SpeechControls } from "./SpeechControls.jsx";
import { request } from '../api.js';
import { useMemories } from '../hooks/useMemories.js';
import { MemoryLibrary } from './MemoryLibrary.jsx';
import { memoryPreview, selectedMemories, withMemories } from '../memoryContext.js';

export function CompanionPanel({ tasks = [], onReviewTask, onBusyChange, onSpeakingChange, character, compact = false, onOpenCompanion, onWriteDraft }) {
  const { chat, speech } = useConversation();
  const memories = useMemories();
  const [memorySending, setMemorySending] = useState(false);
  const sendingLock = useRef(false);
  const busy = chat.busy || memorySending;
  useEffect(() => { onSpeakingChange?.(speech.phase === "speaking"); return () => onSpeakingChange?.(false); }, [speech.phase, onSpeakingChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [inputError, setInputError] = useState("");
  const [planning, setPlanning] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [sharePreferences, setSharePreferences] = useState(false);
  const preview = taskContextPreview(tasks.filter((task) => selected.has(task.id)));
  const memoryText = memoryPreview(selectedMemories(memories.snapshot, memories.selected));
  const messageSize = Array.from(withMemories(withPreferences(draft.trim() + (preview ? `\n\n${preview}` : ""), preferences, sharePreferences), memoryText)).length;
  const history = useRef(null);
  useEffect(() => {
    const element = history.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);
  const last = chat.messages.at(-1);
  async function submit(event) {
    event.preventDefault();
    if (busy || sendingLock.current || !chat.status?.configured || !draft.trim()) return;
    sendingLock.current = true; setMemorySending(true);
    try {
      if (messageSize > 4000) throw Error('消息与全部分享内容合计不得超过 4000 字符');
      let shared = '';
      if (memories.selected.length) {
        const value = await request('/api/companion/memories/share', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: memories.snapshot.revision, ids: memories.selected }) });
        shared = value.preview;
      }
      const text = withMemories(withPreferences(composeChatMessage(draft, preview), preferences, sharePreferences), shared);
      if (Array.from(text).length > 4000) throw Error('消息与全部分享内容合计不得超过 4000 字符');
      if (chat.submit(text)) { setDraft(""); setSelected(new Set()); setSharePreferences(false); memories.setSelected([]); setInputError(""); }
    } catch (error) { setInputError(error.message); }
    finally { sendingLock.current = false; setMemorySending(false); }
  }
  return <><section className="panel companion-panel" data-compact={compact} aria-labelledby="chat-title">
    <div className="panel-header"><div><div className="panel-title" id="chat-title">AI 陪伴 · Day</div>
      <div className="panel-subtitle">聊聊目标，或一起拆解下一步</div></div>
      <span className="online-badge">{chat.checking ? "检查中" : chat.status?.configured ? "已连接" : "待配置"}</span></div>
    {!compact && <details className="chat-tools"><summary>对话设置与记忆{!chat.status?.configured&&' · 待配置'}</summary>
    <p className="chat-description">发送的消息与近期对话会交给已配置模型。任务和记忆需要手动选择分享。</p>
    <CompanionLibrary chat={chat} onPreferences={setPreferences} />
    <MemoryLibrary memories={memories} chatBusy={busy} />
    <SpeechControls speech={speech} />
    {chat.recovered && <p className="form-hint" role="status">已恢复上次对话；未完成的回复不会自动重新发送。</p>}
    {chat.storageWarning && <p className="form-error" role="status">{chat.storageWarning}</p>}
    <div className="chat-config"><span>{chat.status?.configured ? `模型：${chat.status.model}` : chat.status?.message
      || (chat.checking ? "正在检查聊天服务…" : "尚未读取配置状态，请检查后端并重试。")}</span>
      <button disabled={chat.checking || busy} onClick={chat.refreshStatus}>检查配置</button></div>
    </details>}
    <div className="chat-history" ref={history} role="log" aria-label="与 Day 的对话" aria-live="off">
      {chat.messages.length === 0 && <div className="chat-welcome"><CompanionAvatar character={character} portrait />
        <p>你好，我是 Day。今天想先完成哪一个小目标？</p></div>}
      {chat.messages.map((message) => <div className={`chat-message chat-${message.role}`} key={message.id}>
        <strong>{message.role === "user" ? "你" : "Day"}</strong><p>{message.content || (message.status === "streaming" ? "正在思考…" : "未收到回复")}</p>
        {message.status === "cancelled" && <small>已停止，回复未完成</small>}
        {message.status === "error" && <small>回复未完成</small>}
        {message.role === "assistant" && message.status === "complete" && speech.supported && <button className="speech-message-button"
          disabled={busy || !speech.voice || speech.loading} onClick={() => speech.playingId === message.id ? speech.stop() : speech.speak(message)}>
          {speech.playingId === message.id ? "停止朗读" : "朗读"}</button>}</div>)}
    </div>
    {chat.error && <p className="form-error" role="alert">{chat.error}</p>}
    <p className="chat-generation" role="status">{memorySending ? '正在核对本次分享内容…' : chat.busy ? "Day 正在回复…" : ""}</p>
    <form className="chat-form" onSubmit={submit}><label htmlFor="chat-input">给 Day 发消息</label>
      <textarea id="chat-input" maxLength={4000} rows={3} value={draft} disabled={busy}
        placeholder="例如：我总是拖延，帮我拆解一下今天的学习计划" onChange={(event) => { setDraft(event.target.value); setInputError(""); }} />
      {!compact && <details className="chat-sharing"><summary>分享任务与偏好</summary>
      <TaskChatContext tasks={tasks} selected={selected} onChange={setSelected} preview="" disabled={busy} />
      <label><input type="checkbox" checked={sharePreferences} disabled={busy || !preferences}
        onChange={event => setSharePreferences(event.target.checked)} />本次消息分享已保存的偏好</label>
      </details>}
      {sharePreferences && preferences && <pre className="form-hint">{preferencePreview(preferences)}</pre>}
      {memoryText && <><p>本次将分享以下记忆，可在上方记忆面板取消勾选：</p><pre className="memory-share-preview">{memoryText}</pre></>}
      {preview&&<div className="task-context-preview"><strong>本次分享的任务</strong><pre>{preview}</pre><button type="button" disabled={busy} onClick={()=>setSelected(new Set())}>取消本次分享</button></div>}
      <p className={messageSize > 4000 ? "form-error" : "form-hint"}>{messageSize} / 4000</p>
      {inputError && <p className="form-error" role="alert">{inputError}</p>}
      <div className="chat-actions">{!compact && <details className="chat-more"><summary>更多</summary><button type="button" disabled={busy || (!chat.messages.length && !chat.storageWarning)}
        onClick={() => { if (window.confirm("清空本标签页的对话和缓存？本机存档仍会保留，请另行删除。不会删除任务，也不能撤回已发送给模型服务的内容。")) {
          chat.clear(); setSelected(new Set()); memories.setSelected([]); setInputError("");
        } }}>清空对话</button></details>}
        {chat.busy ? <button type="button" onClick={chat.cancel}>停止生成</button> : <>
          {["error", "cancelled"].includes(last?.status) && <button type="button" disabled={memorySending || !chat.status?.configured} onClick={chat.retry}>重试回复</button>}
          <button className="chat-send" disabled={memorySending || !chat.status?.configured || !draft.trim() || messageSize > 4000}>发送</button></>}
      </div></form>
    {!compact && <details className="chat-planning"><summary>让 Day 帮我安排任务</summary><button className="ai-plan-button" disabled={busy || !chat.status?.configured || !onReviewTask}
      onClick={() => setPlanning(true)}>AI 生成任务草稿</button></details>}
    {compact && <button className="chat-open-space" onClick={onOpenCompanion}>对话设置、记忆与任务规划 ↗</button>}
    {compact && onWriteDraft && <div className="home-panel-footer"><button className="home-draft-button" disabled={busy} onClick={onWriteDraft}>AI 写任务草稿</button></div>}
  </section>
    {planning && <AiTaskPlanner onClose={() => setPlanning(false)} onReview={(draft) => {
      setPlanning(false); onReviewTask(draft);
    }} />}
  </>;
}

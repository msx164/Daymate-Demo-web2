import { useState } from 'react';
import { MEMORY_KINDS } from '../memoryContext.js';
import './MemoryLibrary.css';

function MemoryEditor({ initial, disabled, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => initial || { id: crypto.randomUUID(), kind: 'goal', title: '', content: '', can_share: false, completed: false });
  const dirty = initial ? JSON.stringify(initial) !== JSON.stringify(draft) : !!(draft.title || draft.content);
  const update = value => setDraft(current => ({ ...current, ...value }));
  return <form className="memory-editor" data-unsaved={dirty} onSubmit={event => { event.preventDefault(); void onSave(draft); }}>
    <h4>{initial ? '编辑记忆' : '添加目标或记忆'}</h4>
    <label>分类<select disabled={disabled} value={draft.kind} onChange={event => update({ kind: event.target.value, completed: false })}>
      {Object.entries(MEMORY_KINDS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    <label>标题<input required maxLength={80} readOnly={disabled} value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
    <label>内容<textarea required rows={3} maxLength={500} readOnly={disabled} value={draft.content} onChange={event => update({ content: event.target.value })} /></label>
    <label><input type="checkbox" disabled={disabled} checked={draft.can_share} onChange={event => update({ can_share: event.target.checked })} />允许在聊天时选择这条记忆（仍需每次勾选）</label>
    {draft.kind === 'goal' && <label><input type="checkbox" disabled={disabled} checked={draft.completed} onChange={event => update({ completed: event.target.checked })} />目标已完成</label>}
    <div className="chat-actions"><button disabled={disabled || !dirty || !draft.title.trim() || !draft.content.trim()}>保存记忆</button>
      {initial && <button type="button" disabled={disabled} onClick={() => { if (!dirty || window.confirm('放弃本次未保存的编辑？')) onCancel(); }}>取消编辑</button>}</div>
  </form>;
}

export function MemoryLibrary({ memories, chatBusy }) {
  const { snapshot, selected, setSelected, busy, error, action } = memories;
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const disabled = busy || chatBusy || !!error || !snapshot;
  const initial = snapshot?.entries.find(item => item.id === editing);
  async function save(draft) {
    const entries = snapshot.entries.filter(item => item.id !== draft.id);
    if (await action([...entries, draft])) { setEditing(null); setNotice('记忆已保存到本机；不会自动发送。'); }
  }
  async function remove(item) {
    const draftWarning = document.querySelector('.memory-editor[data-unsaved="true"]') ? '这也会放弃当前未保存的编辑。' : '';
    if (!window.confirm(`删除“${item.title}”？${draftWarning}不会清除既有聊天，也不能撤回模型已经收到的内容。`)) return;
    if (await action(snapshot.entries.filter(entry => entry.id !== item.id))) { setEditing(null); setNotice('记忆已删除，本次分享选择已清空。'); }
  }
  return <details className="memory-library" aria-busy={busy}><summary>长期目标与本机记忆{snapshot ? `（${snapshot.entries.length}/50）` : ''}</summary>
    <p>仅记录你手动输入的内容，不从聊天自动提取。每条默认仅本机保存；最多 50 条、合计 20000 字符，每次最多分享 5 条。</p>
    <p>已分享的文字会留在近期对话中，并可能随之后的聊天再次发送。删除或取消授权只阻止新的选择；如需停止沿用旧内容，请清空当前对话并处理本机存档，模型服务收到的内容无法撤回。</p>
    <div className="chat-actions"><button disabled={busy || chatBusy} onClick={async () => {
      if (!window.confirm('重新读取会放弃未保存的编辑，并清空本次分享选择，继续吗？')) return;
      if (await action()) { setEditing(null); setNotice('已重新读取记忆。'); }
    }}>重新读取记忆</button>
      <button disabled={disabled || !snapshot?.entries.length} onClick={async () => {
        if (window.confirm('删除全部本机记忆并放弃未保存的编辑？已有对话和模型服务中的内容不会撤回。') && await action([], true)) { setEditing(null); setNotice('全部记忆已删除。'); }
      }}>删除全部记忆</button></div>
    {busy && <p role="status">正在读取或保存记忆…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {snapshot && <><ul className="memory-list">{snapshot.entries.map(item => <li key={item.id}>
      <strong>{item.title}</strong><span>{MEMORY_KINDS[item.kind]} · {item.completed ? '已完成' : item.can_share ? '可选择分享' : '仅本机'}</span>
      <p>{item.content}</p><div className="chat-actions"><button disabled={disabled} onClick={() => {
        if (document.querySelector('.memory-editor[data-unsaved="true"]') && !window.confirm('切换编辑会放弃当前草稿，继续吗？')) return;
        setEditing(item.id); setNotice('');
      }}>编辑记忆</button><button disabled={disabled} onClick={() => remove(item)}>删除记忆</button></div>
      {item.can_share && !item.completed && <label><input type="checkbox" checked={selected.includes(item.id)}
        disabled={disabled || (!selected.includes(item.id) && selected.length >= 5)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />本次消息分享：{item.title}</label>}
    </li>)}</ul>
      <MemoryEditor key={`${snapshot.revision}:${editing || 'new'}`} initial={initial} disabled={disabled || (!initial && snapshot.entries.length >= 50)} onSave={save} onCancel={() => setEditing(null)} />
    </>}
  </details>;
}

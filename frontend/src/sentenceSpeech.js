// A bounded local sentence queue. It never sends chat requests or owns microphone tracks.
export function nextSpokenSentence(text, offset, finished) {
  const tail = text.slice(offset);
  if (!tail) return null;
  const fence = tail.indexOf('```');
  if (fence >= 0 && !tail.slice(0, fence).trim()) {
    const close = tail.indexOf('```', fence + 3);
    if (close < 0) return finished ? { text: '', end: text.length } : null;
    return { text: '', end: offset + close + 3 };
  }
  const limit = fence >= 0 ? fence : tail.length;
  let boundary = 0;
  for (let i = 0; i < limit; i++) {
    const char = tail[i];
    const period = char === '.' && i + 1 < limit && /\s/.test(tail[i + 1]) && !/\d/.test(tail[i - 1] || '');
    if (/[。！？!?；;\n]/.test(char) || period) {
      if (tail.slice(0, i + 1).trim().length >= 8) { boundary = i + 1; break; }
    }
    if (i >= 199 && /[\s，,、]/.test(char)) { boundary = i + 1; break; }
    if (i >= 239) { boundary = i + 1; break; }
  }
  if (!boundary && fence > 0) boundary = fence;
  if (!boundary && finished) boundary = limit;
  if (!boundary) return null;
  // Avoid a surrogate pair being separated by a long-line cut.
  if (boundary < tail.length && /[\uD800-\uDBFF]/.test(tail[boundary - 1]) && /[\uDC00-\uDFFF]/.test(tail[boundary])) boundary--;
  if (!finished) {
    const partialFence = tail.match(/`{1,2}$/)?.[0].length || 0;
    if (partialFence && boundary > tail.length - partialFence) boundary = tail.length - partialFence;
  }
  if (!boundary) return null;
  const spoken = tail.slice(0, boundary).replace(/[`*_#]/g, '').trim();
  return { text: spoken, end: offset + boundary };
}

export function createSentenceSpeech({ chat, speech }) {
  let view = { active: false, phase: 'off', error: '', completedId: null, segments: 0 };
  let id = null, cursor = 0, observed = '', pending = false, revision = 0, pumping = false, unsubs = [];
  const listeners = new Set();
  const emit = patch => { view = { ...view, ...patch }; listeners.forEach(fn => fn()); };
  function stop(error = '') {
    revision++; id = null; cursor = 0; observed = ''; pending = false;
    const wasActive = view.active;
    emit({ active: false, phase: error ? 'error' : 'off', error, completedId: null });
    if (wasActive) void speech.stop();
  }
  function pump() {
    if (!view.active || pumping) return;
    pumping = true;
    try {
      const conversation = chat.getSnapshot(), audio = speech.getSnapshot();
      const reply = conversation.messages.at(-1);
      if (!reply || reply.id !== id || reply.role !== 'assistant' || !['streaming', 'complete'].includes(reply.status) ||
          !reply.content.startsWith(observed) || reply.content.length > 32000) {
        stop('回复已取消、改变或生成失败，分句朗读已停止，文字保留。'); return;
      }
      observed = reply.content;
      if (pending) {
        if (audio.error || audio.phase === 'error') { stop(audio.error || '分句朗读失败，文字保留。'); return; }
        if (audio.phase === 'idle' && audio.outcome === 'completed' && audio.completedId === id) {
          pending = false; emit({ segments: view.segments + 1 });
        } else if (audio.outcome === 'cancelled' || (['starting', 'speaking'].includes(audio.phase) && audio.playingId !== id)) {
          stop('朗读已停止或切换，未播放的句子已丢弃。'); return;
        } else if (audio.phase === 'idle') {
          stop('未确认本句朗读完成，请重启 Demo 或关闭分句朗读后重试。'); return;
        } else return;
      }
      const finished = reply.status === 'complete' && !conversation.busy;
      let next;
      while ((next = nextSpokenSentence(reply.content, cursor, finished))) {
        cursor = next.end;
        if (!next.text) continue;
        if (view.segments >= 128) { stop('回复分句过多，已停止朗读，请查看文字。'); return; }
        pending = true;
        const current = revision;
        emit({ phase: 'playing' });
        Promise.resolve(speech.speakSegment({ id, role: 'assistant', status: 'complete', content: next.text }, observed))
          .then(accepted => { if (current === revision && !accepted) stop('本地分句朗读不可用，已保留文字。'); })
          .catch(() => { if (current === revision) stop('本地分句朗读失败，已保留文字。'); });
        return;
      }
      if (finished && !view.segments) stop('回复没有可朗读正文，请查看文字。');
      else if (finished) { emit({ active: false, phase: 'complete', completedId: id }); id = null; }
      else emit({ phase: 'waiting' });
    } finally { pumping = false; }
  }
  return {
    getSnapshot: () => view,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    connect() { if (!unsubs.length) unsubs = [chat.subscribe(pump), speech.subscribe(pump)]; },
    start(replyId) {
      stop(); id = replyId; cursor = 0; observed = ''; pending = false;
      emit({ active: true, phase: 'waiting', error: '', completedId: null, segments: 0 }); pump();
    },
    stop,
    dispose() { stop(); unsubs.forEach(fn => fn()); unsubs = []; },
  };
}

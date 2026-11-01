const KEY = "daymate.speechPreferences.v1";
const active = phase => phase === "starting" || phase === "speaking";
export function createSpeechController({ bridge, storage, newKey = () => crypto.randomUUID() } = {}) {
  let saved = { voice: "", rate: 0 }, warning = "";
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || typeof parsed.voice !== "string" || parsed.voice.length > 200 || ![-2, 0, 2].includes(parsed.rate)) throw Error();
      saved = { voice: parsed.voice, rate: parsed.rate };
    }
  } catch { warning = "朗读设置无法读取，已使用默认设置。"; }
  let view = { supported: !!bridge?.playSpeech, voices: [], voice: saved.voice, rate: saved.rate,
    loading: false, phase: "idle", playingId: null, error: "", warning, outcome: 'idle', completedId: null,viseme:0,visemeDuration:0,lipSource:'none',lipTick:0 };
  let wanted = null, text = "", streamPrefix = null, revision = 0, voicesRevision = 0, lastSequence = -1, unsubscribe;
  const listeners = new Set();
  const emit = patch => { view = { ...view, ...patch }; listeners.forEach(fn => fn()); };
  const persist = () => {
    try {
      if (!storage) throw Error();
      storage.setItem(KEY, JSON.stringify({ version: 1, voice: view.voice, rate: view.rate }));
      emit({ warning: "" });
    } catch { emit({ warning: "朗读设置无法保存，本次选择仍有效。" }); }
  };
  const accept = value => {
    if (!value || value.sequence < lastSequence) return;
    lastSequence = value.sequence;
    if ((wanted && value.requestId !== wanted) || (!wanted && active(value.phase))) return;
    const completedId = wanted && value.phase === 'idle' && value.outcome === 'completed' ? view.playingId : view.completedId;
    const mouth=value.phase==='speaking'&&Number.isInteger(value.viseme)&&value.viseme>=0&&value.viseme<=21 ? {viseme:value.viseme,visemeDuration:Math.min(800,Math.max(30,value.visemeDuration||100)),lipSource:value.lipSource==='viseme'?'viseme':value.lipSource==='word'?'word':'none',lipTick:value.sequence}:value.phase==='idle'||value.phase==='error'?{viseme:0,lipSource:'none',lipTick:value.sequence}:{};
    if (!active(value.phase)) { wanted = null; text = ""; streamPrefix = null; }
    emit({ phase: value.phase, playingId: active(value.phase) ? value.id : null, error: value.error || "", outcome: value.outcome || (value.phase === 'error' ? 'error' : view.outcome), completedId,...mouth });
  };
  async function stop() {
    const current = ++revision; wanted = null; text = ""; streamPrefix = null;
    emit({ phase: "idle", playingId: null, error: "", outcome: 'cancelled', completedId: null,viseme:0,lipSource:'none' });
    if (!bridge) return;
    try { const result = await bridge.stopSpeech(); if (current === revision) accept(result); }
    catch { if (current === revision) emit({ error: "停止朗读未确认，请重试或退出应用。" }); }
  }
  async function speak(message, prefix = null) {
    if (!view.supported || message?.role !== "assistant" || message.status !== "complete" || typeof message.content !== "string"
      || !Number.isSafeInteger(message.id) || message.id <= 0 || !message.content.trim()
      || Array.from(message.content).length > 16000 || !view.voices.some(voice => voice.id === view.voice)
      || (prefix !== null && (typeof prefix !== 'string' || prefix.length > 32000))) return false;
    const current = ++revision;
    wanted = newKey(); text = message.content; streamPrefix = prefix;
    const requestId = wanted;
    emit({ phase: "starting", playingId: message.id, error: "", outcome: 'playing', completedId: null });
    try { const result = await bridge.playSpeech({ id: message.id, text, requestId, voice: view.voice, rate: view.rate }); if (current === revision) accept(result); }
    catch (error) {
      if (current === revision) { wanted = null; text = ""; streamPrefix = null; emit({ phase: "error", playingId: null, outcome: 'error', error: error.message || "朗读失败，请重试。" }); }
    }
    return true;
  }
  return {
    getSnapshot: () => view,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    connect() {
      if (!bridge || unsubscribe) return;
      unsubscribe = bridge.onSpeechState(accept);
    },
    async loadVoices() {
      if (!view.supported || view.loading || active(view.phase)) return;
      const current = ++voicesRevision;
      emit({ loading: true, error: "" });
      try {
        const voices = await bridge.getSpeechVoices();
        if (current !== voicesRevision) return;
        const voice = voices.some(item => item.id === view.voice) ? view.voice : (voices.find(item => item.language.startsWith("zh")) || voices[0])?.id || "";
        emit({ voices, voice, error: voices.length ? "" : "没有可用本地声音，请在 Windows 语言设置中安装语音包后重试。" });
      } catch (error) { if (current === voicesRevision) emit({ error: error.message || "本地声音读取失败，请重试。" }); }
      finally { if (current === voicesRevision) emit({ loading: false }); }
    },
    chooseVoice(voice) { if (!active(view.phase) && view.voices.some(item => item.id === voice)) { emit({ voice }); persist(); } },
    chooseRate(rate) { if (!active(view.phase) && [-2, 0, 2].includes(rate)) { emit({ rate }); persist(); } },
    speak: message => speak(message),
    speakSegment: (message, prefix) => speak(message, prefix),
    stop,
    syncMessages(messages, busy) {
      if (active(view.phase) && streamPrefix !== null) {
        const message = messages.at(-1);
        if (!message || message.id !== view.playingId || message.role !== 'assistant' || !['streaming', 'complete'].includes(message.status) || !message.content.startsWith(streamPrefix)) void stop();
        return;
      }
      if (active(view.phase) && (busy || !messages.some(message => message.id === view.playingId && message.role === "assistant"
        && message.status === "complete" && message.content === text))) void stop();
    },
    dispose() { voicesRevision++; unsubscribe?.(); unsubscribe = null; void stop(); },
  };
}

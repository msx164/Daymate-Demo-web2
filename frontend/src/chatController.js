import { getChatStatus, streamChat } from "./chatApi.js";
import { readChatMessages, trimChatMessages, writeChatMessages } from "./chatStorage.js";

// Include only whole successful turns. Keep recent contiguous turns within server bounds.
export function buildChatHistory(messages, userText) {
  const pairs = [];
  for (let i = 0; i + 1 < messages.length; i += 2) {
    const user = messages[i], assistant = messages[i + 1];
    if (user.role === "user" && assistant.role === "assistant" && assistant.status === "complete") {
      pairs.push([{ role: "user", content: user.content }, { role: "assistant", content: assistant.content }]);
    }
  }
  let size = Array.from(userText).length;
  const recent = [];
  for (let i = pairs.length - 1; i >= 0 && recent.length < 9; i--) {
    const count = pairs[i].reduce((total, message) => total + Array.from(message.content).length, 0);
    if (size + count > 16000) break;
    recent.unshift(pairs[i]);
    size += count;
  }
  return [...recent.flat(), { role: "user", content: userText }];
}

export function createChatController({ checkStatus = getChatStatus, stream = streamChat, storage } = {}) {
  const restored = readChatMessages(storage);
  let view = { messages: restored.messages, busy: false, error: "", status: null, checking: false,
    recovered: restored.messages.length > 0, storageWarning: restored.warning };
  let revision = 0, statusRevision = 0, nextId = Math.max(0, ...restored.messages.map((item) => item.id));
  let active, statusRequest;
  const listeners = new Set();
  const emit = (patch) => { view = { ...view, ...patch }; listeners.forEach((fn) => fn()); };
  const checkpoint = () => {
    const warning = writeChatMessages(storage, view.messages);
    if (warning !== view.storageWarning) emit({ storageWarning: warning });
  };
  const updateReply = (id, patch) => emit({ messages: view.messages.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const cancel = () => {
    revision++;
    active?.abort();
    if (view.busy) {
      const last = view.messages.at(-1);
      updateReply(last.id, { status: "cancelled" });
      emit({ busy: false, error: "" });
      checkpoint();
    }
  };
  async function generate(text, retry) {
    if (view.busy) return false;
    if (!view.status?.configured) { emit({ error: "请先完成模型配置并检查配置状态。" }); return false; }
    text = text.trim();
    if (!text || Array.from(text).length > 4000) { emit({ error: "请输入 1–4000 字符的消息。" }); return false; }
    const previous = retry ? view.messages.slice(0, -2) : view.messages;
    const history = buildChatHistory(previous, text);
    const user = retry ? view.messages.at(-2) : { id: ++nextId, role: "user", content: text };
    const reply = { id: ++nextId, role: "assistant", content: "", status: "streaming" };
    const current = ++revision;
    active = new AbortController();
    emit({ messages: trimChatMessages([...previous, user, reply]), busy: true, error: "", recovered: false });
    checkpoint();
    try {
      await stream(history, { signal: active.signal, onDelta: (delta) => {
        if (current !== revision) return;
        const item = view.messages.find((message) => message.id === reply.id);
        updateReply(reply.id, { content: item.content + delta });
      } });
      if (current === revision) {
        if (!view.messages.find((item) => item.id === reply.id).content.trim()) throw new Error("模型未返回有效文本");
        updateReply(reply.id, { status: "complete" });
      }
    } catch (failure) {
      if (current === revision) {
        updateReply(reply.id, { status: "error" });
        emit({ error: `回复失败：${failure.message}。重试会重新请求模型。` });
      }
    } finally { if (current === revision) { emit({ busy: false }); checkpoint(); } }
    return true;
  }
  return {
    getSnapshot: () => view,
    checkpoint,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async refreshStatus() {
      statusRequest?.abort();
      statusRequest = new AbortController();
      const current = ++statusRevision;
      emit({ checking: true });
      try {
        const status = await checkStatus(statusRequest.signal);
        if (current === statusRevision) emit({ status, error: "", checking: false });
      } catch (failure) {
        if (current === statusRevision) emit({ status: null, error: `配置检查失败：${failure.message}`, checking: false });
      }
    },
    send: (text) => generate(text, false),
    submit(text) {
      const previous = view.messages;
      void generate(text, false);
      return view.messages !== previous;
    },
    retry() {
      const last = view.messages.at(-1);
      if (!last || !["error", "cancelled"].includes(last.status)) return Promise.resolve(false);
      return generate(view.messages.at(-2).content, true);
    },
    cancel,
    restoreMessages(messages) {
      if (view.busy) return false;
      const value = readChatMessages({ getItem: () => JSON.stringify({ version: 1, messages }) });
      if (value.warning) { emit({ error: value.warning }); return false; }
      revision++;
      nextId = Math.max(nextId, 0, ...value.messages.map(item => item.id));
      emit({ messages: value.messages, recovered: value.messages.length > 0, error: "" });
      checkpoint();
      return true;
    },
    clear() { cancel(); emit({ messages: [], error: "", recovered: false }); checkpoint(); },
    dispose() { cancel(); statusRevision++; statusRequest?.abort(); },
  };
}

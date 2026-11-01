const KEY = "daymate.chatHistory.v1";
const count = (text) => Array.from(text).length;

export function trimChatMessages(messages) {
  let size = 0;
  let start = messages.length;
  for (let i = messages.length - 2; i >= 0 && messages.length - i <= 100; i -= 2) {
    const pairSize = count(messages[i].content) + count(messages[i + 1].content);
    if (size + pairSize > 100000) break;
    start = i;
    size += pairSize;
  }
  return messages.slice(start);
}

export function readChatMessages(storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { messages: [], warning: "" };
    if (raw.length > 1000000) throw Error("Oversized history");
    const { version, messages } = JSON.parse(raw);
    const ids = new Set();
    if (version !== 1 || !Array.isArray(messages) || messages.length > 100 || messages.length % 2 !== 0
      || !messages.every((item, index) => {
        if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || item.id > 1e12 || ids.has(item.id)
          || item.role !== (index % 2 === 0 ? "user" : "assistant") || typeof item.content !== "string"
          || count(item.content) > (index % 2 === 0 ? 4000 : 16000)
          || (index % 2 === 0 && !item.content.trim())
          || (index % 2 === 1 && (!["streaming", "complete", "error", "cancelled"].includes(item.status)
            || (item.status === "complete" && !item.content.trim())))) return false;
        ids.add(item.id);
        return true;
      })) throw Error("Invalid history");
    if (messages.reduce((size, item) => size + count(item.content), 0) > 100000) throw Error("Oversized history");
    return { messages: messages.map((item) => ({ id: item.id, role: item.role, content: item.content,
      ...(item.role === "assistant" ? { status: item.status === "streaming" ? "cancelled" : item.status } : {}) })), warning: "" };
  } catch { return { messages: [], warning: "上次对话缓存无法读取，未自动恢复。" }; }
}

export function writeChatMessages(storage, messages) {
  try {
    if (!storage) throw Error("Unavailable storage");
    if (messages.length) storage.setItem(KEY, JSON.stringify({ version: 1, messages: trimChatMessages(messages) }));
    else storage.removeItem(KEY);
    return "";
  } catch {
    return messages.length ? "对话缓存无法保存，刷新后的恢复可能不可用。"
      : "本页对话已清空，但浏览器缓存删除失败，刷新可能恢复旧对话。";
  }
}

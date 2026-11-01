import { API_URL, apiHeaders, request } from "./api.js";

export async function getChatStatus(signal) {
  const data = await request("/api/chat/status", { signal });
  if (typeof data?.configured !== "boolean" || typeof data.message !== "string"
    || (data.configured && typeof data.model !== "string")) throw new Error("聊天配置状态格式错误");
  return data;
}

export async function streamChat(messages, { signal, onDelta }) {
  const timeout = AbortSignal.timeout(125000);
  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST", headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ messages }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : `聊天请求失败 (${response.status})`);
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
    throw new Error("聊天响应格式错误");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputSize = 0;
  let complete = false;
  function consume(line) {
    if (!line.trim()) return;
    const item = JSON.parse(line);
    if (item.type === "delta" && typeof item.text === "string") {
      outputSize += item.text.length;
      if (outputSize > 32000) throw new Error("回复超过长度上限");
      onDelta(item.text);
    } else if (item.type === "error" && typeof item.message === "string") {
      throw new Error(item.message);
    } else if (item.type === "done") {
      if (item.reason === "length") throw new Error("回复达到模型长度上限，内容未完成；请缩小问题范围。");
      if (!outputSize) throw new Error("模型未返回文本");
      complete = true;
    } else throw new Error("聊天数据格式错误");
  }
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while (!complete && (end = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 65536) throw new Error("聊天数据超过长度上限");
      if (done) { if (!complete && buffer.trim()) consume(buffer); break; }
    }
    if (!complete) throw new Error("连接提前结束，回复未完成，可以重试。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

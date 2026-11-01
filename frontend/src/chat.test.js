import test from "node:test";
import assert from "node:assert/strict";
import { createChatController, buildChatHistory } from "./chatController.js";
import { streamChat } from "./chatApi.js";

const configured = async () => ({ configured: true, model: "test-model", message: "" });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
test("chat cannot send until configured and never makes a fake reply", async () => {
  let calls = 0;
  const c = createChatController({ checkStatus: async () => ({ configured: false, message: "configure" }), stream: async () => { calls++; } });
  await c.refreshStatus();
  assert.equal(await c.send("hi"), false);
  assert.equal(calls, 0);
  assert.equal(c.getSnapshot().messages.length, 0);
});
test("double submit sends once and commits only a finished stream", async () => {
  const pending = deferred();
  let calls = 0;
  const c = createChatController({ checkStatus: configured, stream: async (_messages, { onDelta }) => {
    calls++; onDelta("你好"); await pending.promise; onDelta("！");
  } });
  await c.refreshStatus();
  const first = c.send("hello");
  assert.equal(await c.send("duplicate"), false);
  assert.equal(c.getSnapshot().messages.at(-1).status, "streaming");
  pending.resolve();
  await first;
  assert.equal(calls, 1);
  assert.equal(c.getSnapshot().messages.at(-1).content, "你好！");
  assert.equal(c.getSnapshot().messages.at(-1).status, "complete");
});
test("retry replaces failed reply without duplicating the user or sending partial history", async () => {
  const histories = [];
  const c = createChatController({ checkStatus: configured, stream: async (messages, { onDelta }) => {
    histories.push(messages); onDelta(histories.length === 1 ? "partial" : "full");
    if (histories.length === 1) throw new Error("offline");
  } });
  await c.refreshStatus();
  await c.send("question");
  assert.equal(c.getSnapshot().messages.at(-1).status, "error");
  await c.retry();
  assert.deepEqual(histories[0], histories[1]);
  assert.equal(c.getSnapshot().messages.length, 2);
  assert.equal(c.getSnapshot().messages.at(-1).content, "full");
});
test("cancel ignores late deltas and clears active state; clear removes page history", async () => {
  const pending = deferred();
  let signal;
  const c = createChatController({ checkStatus: configured, stream: async (_messages, options) => {
    signal = options.signal; options.onDelta("partial"); await pending.promise; options.onDelta("late");
  } });
  await c.refreshStatus();
  const first = c.send("hello");
  c.cancel();
  assert.equal(signal.aborted, true);
  assert.equal(c.getSnapshot().busy, false);
  pending.resolve(); await first;
  assert.equal(c.getSnapshot().messages.at(-1).content, "partial");
  assert.equal(c.getSnapshot().messages.at(-1).status, "cancelled");
  c.clear();
  assert.deepEqual(c.getSnapshot().messages, []);
});
test("context includes complete turns only and respects length and turn bounds", () => {
  const messages = Array.from({ length: 12 }, (_value, i) => [
    { role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}`, status: "complete" },
  ]).flat();
  const result = buildChatHistory(messages, "new");
  assert.equal(result.length, 19);
  assert.equal(result[0].content, "q3");
  const partial = [{ role: "user", content: "old" }, { role: "assistant", content: "partial", status: "error" }];
  assert.deepEqual(buildChatHistory(partial, "new"), [{ role: "user", content: "new" }]);
  const large = [{ role: "user", content: "old" }, { role: "assistant", content: "x".repeat(16000), status: "complete" }];
  assert.equal(buildChatHistory(large, "new").length, 1);
});
test("old status checks cannot overwrite new configuration and dispose ignores late replies", async () => {
  const old = deferred(); let calls = 0;
  const c = createChatController({ checkStatus: () => calls++ ? configured() : old.promise });
  const first = c.refreshStatus();
  await c.refreshStatus();
  old.resolve({ configured: false, message: "stale" }); await first;
  assert.equal(c.getSnapshot().status.configured, true);
  c.dispose();
  await c.refreshStatus();
  assert.equal(c.getSnapshot().checking, false);
});

function fakeResponse(text, blockSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += blockSize) controller.enqueue(bytes.slice(i, i + blockSize));
    controller.close();
  } }), { headers: { "content-type": "application/x-ndjson" } });
}
test("UTF-8 characters and NDJSON frames can split across arbitrary network chunks", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => fakeResponse('{"type":"delta","text":"你好🤖"}\n{"type":"done","reason":"stop"}\n');
  let output = "";
  try { await streamChat([{ role: "user", content: "hi" }], { onDelta: (text) => { output += text; } });
    assert.equal(output, "你好🤖");
  } finally { globalThis.fetch = original; }
});
test("stream error and unexpected EOF preserve text but reject completion", async () => {
  const original = globalThis.fetch;
  try {
    for (const tail of ['', '{"type":"error","message":"offline"}\n', '{"type":"done","reason":"length"}\n']) {
      globalThis.fetch = async () => fakeResponse('{"type":"delta","text":"partial"}\n' + tail, 3);
      let output = "";
      await assert.rejects(streamChat([], { onDelta: (text) => { output += text; } }));
      assert.equal(output, "partial");
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "not configured" }), { status: 503 });
    await assert.rejects(streamChat([], { onDelta() {} }), /not configured/);
  } finally { globalThis.fetch = original; }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createChatController, buildChatHistory } from "./chatController.js";
import { readChatMessages, trimChatMessages } from "./chatStorage.js";
import { composeChatMessage, taskContextPreview } from "./taskChatContext.js";

function storageFixture() {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key) };
  return { storage, entries };
}
const status = async () => ({ configured: true, model: "test", message: "" });
const task = { id: 8, name: "学习数学", task_date: "2026-10-12", start_time: "15:00", end_time: "16:00",
  task_type: "学习", completed: false, private_notes: "never share", deleted_at: null };

test("complete conversation survives reload without automatically sending", async () => {
  const f = storageFixture();
  const first = createChatController({ storage: f.storage, checkStatus: status, stream: async (_, { onDelta }) => onDelta("answer") });
  await first.refreshStatus();
  await first.send("question");
  let requests = 0;
  const restored = createChatController({ storage: f.storage, checkStatus: status, stream: async (messages, { onDelta }) => {
    requests++;
    assert.deepEqual(messages.slice(0, 2), [{ role: "user", content: "question" }, { role: "assistant", content: "answer" }]);
    onDelta("follow-up");
  } });
  assert.equal(restored.getSnapshot().recovered, true);
  assert.equal(requests, 0);
  await restored.refreshStatus();
  assert.equal(requests, 0);
  await restored.send("next");
  assert.equal(requests, 1);
  const ids = restored.getSnapshot().messages.map((item) => item.id);
  assert.equal(new Set(ids).size, 4);
});

test("reload during streaming restores an interrupted reply and retries the frozen task snapshot", async () => {
  const f = storageFixture();
  let release;
  const first = createChatController({ storage: f.storage, checkStatus: status, stream: async (_, { onDelta }) => {
    onDelta("partial"); await new Promise((done) => { release = done; });
  } });
  await first.refreshStatus();
  const wire = composeChatMessage("帮我拆解", taskContextPreview([task]));
  const pending = first.send(wire);
  first.checkpoint();
  const restored = createChatController({ storage: f.storage, checkStatus: status, stream: async (messages, { onDelta }) => {
    assert.deepEqual(messages, [{ role: "user", content: wire }]); onDelta("full");
  } });
  assert.equal(restored.getSnapshot().messages.at(-1).status, "cancelled");
  assert.equal(restored.getSnapshot().messages.at(-1).content, "partial");
  assert.equal(restored.getSnapshot().busy, false);
  await restored.refreshStatus();
  await restored.retry();
  assert.equal(restored.getSnapshot().messages.length, 2);
  assert.equal(restored.getSnapshot().messages.at(-1).content, "full");
  first.dispose(); release(); await pending;
});

test("clear removes stored conversation and refresh remains empty", async () => {
  const f = storageFixture();
  const c = createChatController({ storage: f.storage, checkStatus: status, stream: async (_, { onDelta }) => onDelta("reply") });
  await c.refreshStatus(); await c.send("hi");
  c.clear();
  assert.equal(f.entries.size, 0);
  assert.deepEqual(createChatController({ storage: f.storage }).getSnapshot().messages, []);
});

test("blocked storage reports save and clear failures without blocking chat", async () => {
  const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); }, removeItem() { throw Error("denied"); } };
  const c = createChatController({ storage: denied, checkStatus: status, stream: async (_, { onDelta }) => onDelta("reply") });
  assert.notEqual(c.getSnapshot().storageWarning, "");
  await c.refreshStatus(); await c.send("hi");
  assert.equal(c.getSnapshot().messages.at(-1).status, "complete");
  assert.match(c.getSnapshot().storageWarning, /无法保存/);
  c.clear();
  assert.match(c.getSnapshot().storageWarning, /删除失败/);
});

test("corrupt, duplicate and oversized cached histories are ignored", () => {
  const f = storageFixture();
  const valid = [{ id: 1, role: "user", content: "hi" }, { id: 2, role: "assistant", content: "reply", status: "complete" }];
  const broken = ["{broken", JSON.stringify({ version: 1, messages: valid.slice(0, 1) }),
    JSON.stringify({ version: 1, messages: [valid[0], { ...valid[1], id: 1 }] }),
    JSON.stringify({ version: 1, messages: [{ ...valid[0], role: "system" }, valid[1]] }),
    JSON.stringify({ version: 1, messages: [{ ...valid[0], content: "x".repeat(4001) }, valid[1]] }),
    JSON.stringify({ version: 1, messages: [valid[0], { ...valid[1], content: "" }] })];
  for (const text of broken) {
    f.entries.set("daymate.chatHistory.v1", text);
    const result = readChatMessages(f.storage);
    assert.deepEqual(result.messages, []);
    assert.notEqual(result.warning, "");
  }
});

test("history bounds remove complete pairs while retaining newest interrupted turn", () => {
  const messages = Array.from({ length: 60 }, (_value, index) => [
    { id: index * 2 + 1, role: "user", content: "q" },
    { id: index * 2 + 2, role: "assistant", content: "a", status: "complete" },
  ]).flat();
  const capped = trimChatMessages(messages);
  assert.equal(capped.length, 100);
  assert.equal(capped[0].id, 21);
  const huge = messages.map((item) => ({ ...item, content: "x".repeat(4000) }));
  assert.equal(trimChatMessages(huge).length, 24);
});

test("task sharing is opt-in, uses only whitelisted fields and matches outgoing preview", () => {
  assert.equal(taskContextPreview([]), "");
  assert.equal(composeChatMessage(" hello "), "hello");
  const preview = taskContextPreview([task]);
  assert.ok(preview.includes(task.name));
  assert.ok(preview.includes(task.task_date));
  assert.ok(!preview.includes("never share"));
  assert.ok(!preview.includes('"id"'));
  assert.equal(composeChatMessage("帮我规划", preview), `帮我规划\n\n${preview}`);
  assert.throws(() => taskContextPreview(Array(6).fill(task)), /最多/);
  assert.throws(() => composeChatMessage("x".repeat(4000), preview), /合计/);
  assert.throws(() => composeChatMessage(" "), /请输入/);
});

test("submission accepts synchronously and retains draft on validation rejection", async () => {
  const c = createChatController({ checkStatus: status, stream: async (_, { onDelta }) => onDelta("reply") });
  assert.equal(c.submit("hello"), false);
  await c.refreshStatus();
  assert.equal(c.submit("x".repeat(4001)), false);
  assert.equal(c.submit("hello"), true);
  assert.equal(c.submit("duplicate"), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(c.getSnapshot().messages.length, 2);
});

test("prior task snapshots remain in complete context, incomplete turns are excluded", () => {
  const snapshot = composeChatMessage("help", taskContextPreview([task]));
  const messages = [{ role: "user", content: snapshot }, { role: "assistant", content: "plan", status: "complete" }];
  assert.equal(buildChatHistory(messages, "next")[0].content, snapshot);
  messages[1].status = "error";
  assert.equal(buildChatHistory(messages, "next").length, 1);
});

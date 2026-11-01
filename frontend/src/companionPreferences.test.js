import test from "node:test";
import assert from "node:assert/strict";
import { withPreferences, preferencePreview } from "./companionPreferences.js";
import { createChatController } from "./chatController.js";

test("preferences require explicit sharing and include only visible whitelisted fields", () => {
  const preferences = { nickname: "Reader", tone: "direct", goal: "Read daily", api_key: "private" };
  assert.equal(withPreferences("hello", preferences, false), "hello");
  const text = withPreferences("hello", preferences, true);
  assert.ok(text.includes("Reader") && text.includes("Read daily"));
  assert.ok(!text.includes("private"));
  assert.equal(text, "hello\n\n" + preferencePreview(preferences));
});

test("loading a local archive never sends to the model and preserves ID uniqueness", async () => {
  let calls = 0;
  const controller = createChatController({ checkStatus: async () => ({ configured: true }), stream: async (_, { onDelta }) => { calls++; onDelta("next"); } });
  const messages = [{ id: 41, role: "user", content: "old" }, { id: 42, role: "assistant", content: "reply", status: "complete" }];
  assert.equal(controller.restoreMessages(messages), true);
  assert.equal(calls, 0);
  await controller.refreshStatus();
  await controller.send("new");
  assert.equal(calls, 1);
  const ids = controller.getSnapshot().messages.map(item => item.id);
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids[2] > 42);
  assert.equal(controller.restoreMessages([{ id: 1, role: "bad" }]), false);
});

test("archive loading cannot replace a reply in progress", async () => {
  let finish;
  const controller = createChatController({ checkStatus: async () => ({ configured: true }),
    stream: async (_, { onDelta }) => { onDelta("reply"); await new Promise(resolve => { finish = resolve; }); } });
  await controller.refreshStatus();
  const pending = controller.send("question");
  assert.equal(controller.restoreMessages([]), false);
  finish(); await pending;
  assert.equal(controller.getSnapshot().messages.length, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechController } from "./speechController.js";
const reply = { id: 2, role: "assistant", status: "complete", content: "private reply" };
test('natural completion is distinguished from cancellation and stale completion',async()=>{
  const f=fixture();await f.controller.loadVoices();await f.controller.speak(reply);
  f.emit({phase:'idle',id:null,outcome:'completed'});assert.equal(f.controller.getSnapshot().completedId,2);
  await f.controller.speak({...reply,id:4});await f.controller.stop();
  f.emit({phase:'idle',id:null,outcome:'completed'});assert.equal(f.controller.getSnapshot().completedId,null);
});
function fixture(storage) {
  let sequence = 0, counter = 0, current, state = { sequence: 0, phase: "idle", id: null, requestId: null };
  const listeners = new Set(), played = [];
  const emit = patch => { state = { ...state, ...patch, sequence: ++sequence }; listeners.forEach(fn => fn(state)); return state; };
  const bridge = {
    onSpeechState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSpeechVoices: async () => [{ id: "en", name: "English", language: "en-US" }, { id: "zh", name: "Chinese", language: "zh-CN" }],
    async playSpeech(value) { current = value; played.push(value); return emit({ phase: "starting", id: value.id, requestId: value.requestId }); },
    async stopSpeech() { return emit({ phase: "idle", id: null }); },
  };
  const controller = createSpeechController({ bridge, storage, newKey: () => `request-${++counter}` });
  controller.connect();
  return { controller, bridge, played, emit, listeners, current: () => current };
}
test("voice discovery never starts audio; only complete assistant messages can be read", async () => {
  const f = fixture(); await f.controller.loadVoices();
  assert.equal(f.played.length, 0); assert.equal(f.controller.getSnapshot().voice, "zh");
  for (const message of [{ ...reply, role: "user" }, { ...reply, status: "streaming" }, { ...reply, status: "cancelled" }, { ...reply, content: "" }]) {
    assert.equal(await f.controller.speak(message), false);
  }
  await f.controller.speak(reply);
  assert.equal(f.played.length, 1); assert.equal(f.controller.getSnapshot().phase, "starting");
  f.emit({ phase: "speaking" }); assert.equal(f.controller.getSnapshot().phase, "speaking");
  await f.controller.stop(); assert.equal(f.controller.getSnapshot().playingId, null);
});
test("late events from a replaced reply cannot change the current reading", async () => {
  const f = fixture(); await f.controller.loadVoices(); await f.controller.speak(reply);
  const previous = f.current().requestId;
  await f.controller.speak({ ...reply, id: 4, content: "next reply" });
  f.emit({ phase: "idle", id: null, requestId: previous });
  assert.equal(f.controller.getSnapshot().playingId, 4);
  f.emit({ phase: "speaking", id: 4, requestId: f.current().requestId });
  assert.equal(f.controller.getSnapshot().phase, "speaking");
  await f.controller.stop();
  f.emit({ phase: "speaking", id: 4 });
  assert.equal(f.controller.getSnapshot().phase, "idle");
});
test("new generation, clearing or replacing archived text stops the current reading", async () => {
  const f = fixture(); await f.controller.loadVoices();
  for (const [messages, busy] of [[[reply], true], [[], false], [[{ ...reply, content: "changed" }], false]]) {
    await f.controller.speak(reply); f.controller.syncMessages(messages, busy);
    assert.equal(f.controller.getSnapshot().phase, "idle");
  }
});
test("only voice and rate persist; stored settings do not enable automatic playback", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const f = fixture(storage); await f.controller.loadVoices(); f.controller.chooseVoice("en"); f.controller.chooseRate(2);
  await f.controller.speak(reply); await f.controller.stop();
  assert.ok(![...values.values()].join().includes(reply.content));
  const restored = fixture(storage); await restored.controller.loadVoices();
  assert.equal(restored.controller.getSnapshot().voice, "en"); assert.equal(restored.controller.getSnapshot().rate, 2);
  assert.equal(restored.played.length, 0);
});
test("missing desktop bridge and unavailable voices fail without fake playback", async () => {
  const controller = createSpeechController();
  assert.equal(controller.getSnapshot().supported, false);
  assert.equal(await controller.speak(reply), false);
  const f = fixture(); f.bridge.getSpeechVoices = async () => [];
  await f.controller.loadVoices(); assert.ok(f.controller.getSnapshot().error);
  assert.equal(await f.controller.speak(reply), false);
});
test("failed playback, blocked preference storage and repeated mounts retain usable controls", async () => {
  const f = fixture({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.ok(f.controller.getSnapshot().warning);
  await f.controller.loadVoices(); f.controller.chooseRate(-2); assert.ok(f.controller.getSnapshot().warning);
  f.bridge.playSpeech = async () => { throw Error("device unavailable"); };
  await f.controller.speak(reply); assert.equal(f.controller.getSnapshot().phase, "error");
  assert.match(f.controller.getSnapshot().error, /device unavailable/);
  f.controller.dispose(); f.controller.connect(); f.controller.connect();
  assert.equal(f.listeners.size, 1);
});

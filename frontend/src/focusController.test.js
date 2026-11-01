import test from "node:test";
import assert from "node:assert/strict";
import { createFocusController } from "./focusController.js";
import { parseFocusDraft } from "./focusDraft.js";

const task = { id: 7, name: "Study", completed: false };

test("resume after sleep counts elapsed time, caps at target and waits for explicit save", async () => {
  const f = fixture(), c = f.controller();
  c.start(task, 900);
  f.advance(600000); c.tick();
  assert.equal(c.getSnapshot().timeLeft, 300);
  assert.notEqual(c.getSnapshot().session.runningSince, null);
  f.advance(3600000); c.tick(); c.tick();
  assert.equal(c.getSnapshot().timeLeft, 0);
  assert.equal(c.getSnapshot().session.elapsedMs, 900000);
  assert.equal(c.getSnapshot().session.snapshot, null);
  c.togglePause();
  assert.equal(c.getSnapshot().session.runningSince, null);
  let calls = 0;
  await c.finish(false, async record => { calls++; assert.equal(record.seconds, 900); });
  assert.equal(calls, 1);
  assert.equal(c.getSnapshot().session, null);
});

test("sleep while manually paused adds no seconds and retains an uncertain save", async () => {
  const f = fixture(), c = f.controller();
  c.start(task, 900); f.advance(2500); c.togglePause();
  f.advance(3600000); c.tick(); c.checkpoint();
  assert.equal(c.getSnapshot().timeLeft, 898);
  assert.equal(c.getSnapshot().session.elapsedMs, 2500);
  c.togglePause(); f.advance(500);
  let frozen;
  await assert.rejects(c.finish(false, async record => { frozen = record; throw Error('network timeout'); }));
  f.advance(3600000); c.tick(); c.checkpoint();
  assert.deepEqual(c.getSnapshot().session.snapshot, frozen);
  await c.finish(false, async record => { assert.deepEqual(record, frozen); assert.equal(record.seconds, 3); });
});
function fixture() {
  let time = 1700000000000;
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const controller = () => createFocusController({ storage, now: () => time, newKey: () => "stable-key" });
  return { controller, entries, advance: (ms) => { time += ms; } };
}
test("reload restores a paused custom timer and excludes time away, retaining fractions", () => {
  const f = fixture();
  const first = f.controller();
  first.start(task, 120);
  f.advance(3700);
  first.checkpoint();
  f.advance(600000);
  const restored = f.controller();
  assert.equal(restored.getSnapshot().recovered, true);
  assert.equal(restored.getSnapshot().session.runningSince, null);
  assert.equal(restored.getSnapshot().timeLeft, 117);
  assert.equal(restored.getSnapshot().session.elapsedMs, 3700);
  restored.togglePause();
  f.advance(300);
  restored.tick();
  assert.equal(restored.getSnapshot().timeLeft, 116);
  assert.equal(restored.getSnapshot().recovered, false);
});
test("expiry is capped and cannot resume after reload", () => {
  const f = fixture();
  const c = f.controller();
  c.start(task, 60);
  f.advance(90000);
  c.tick();
  const restored = f.controller();
  restored.togglePause();
  assert.equal(restored.getSnapshot().timeLeft, 0);
  assert.equal(restored.getSnapshot().session.elapsedMs, 60000);
  assert.equal(restored.getSnapshot().session.runningSince, null);
});
test("concurrent finish only sends once and successful save clears draft", async () => {
  const f = fixture();
  const c = f.controller();
  c.start(task);
  f.advance(1200);
  let resolve;
  let calls = 0;
  const first = c.finish(true, () => { calls++; return new Promise((done) => { resolve = done; }); });
  assert.equal(c.getSnapshot().isSaving, true);
  assert.equal(await c.finish(true, () => { calls++; }), null);
  c.discard();
  assert.notEqual(c.getSnapshot().session, null);
  resolve();
  const record = await first;
  assert.equal(calls, 1);
  assert.equal(record.seconds, 1);
  assert.equal(c.getSnapshot().session, null);
  assert.equal(c.getSnapshot().isSaving, false);
  assert.equal(f.entries.size, 0);
  assert.equal(await c.finish(true, () => assert.fail("committed record cannot resubmit")), null);
});
test("uncertain save survives reload with identical payload and locked intent", async () => {
  const f = fixture();
  const c = f.controller();
  c.start(task, 90);
  f.advance(4300);
  let original;
  await assert.rejects(c.finish(false, async (record) => {
    original = record;
    throw new Error("timeout after commit");
  }), /timeout/);
  assert.match(c.getSnapshot().saveError, /timeout/);
  f.advance(100000);
  const restored = f.controller();
  restored.togglePause();
  assert.equal(restored.getSnapshot().session.runningSince, null);
  assert.equal(await restored.finish(true, () => assert.fail("changed intent")), null);
  await restored.finish(false, async (record) => assert.deepEqual(record, original));
  assert.equal(f.entries.size, 0);
});
test("corrupt drafts do not crash or submit; invalid frozen payload is rejected", () => {
  const f = fixture();
  f.entries.set("daymate.focusDraft.v1", "broken");
  const invalid = f.controller();
  assert.equal(invalid.getSnapshot().session, null);
  assert.notEqual(invalid.getSnapshot().storageWarning, "");
  invalid.start(task);
  const valid = JSON.parse([...f.entries.values()][0]);
  valid.session.startedAt = 1e30;
  assert.throws(() => parseFocusDraft(JSON.stringify(valid)));
  valid.session.startedAt = 1700000000000;
  valid.session.snapshot = { task_id: 99 };
  assert.throws(() => parseFocusDraft(JSON.stringify(valid)));
});
test("blocked storage warns but allows focus and saving", async () => {
  let time = 1700000000000;
  const c = createFocusController({ storage: { getItem() { throw Error("denied"); },
    setItem() { throw Error("denied"); }, removeItem() { throw Error("denied"); } },
  now: () => time, newKey: () => "key" });
  c.start(task, 60);
  time += 2000;
  assert.notEqual(c.getSnapshot().storageWarning, "");
  await c.finish(false, async (record) => assert.equal(record.seconds, 2));
  assert.equal(c.getSnapshot().session, null);
});
test("discard clears checkpoint and snapshots stay referentially stable between changes", () => {
  const f = fixture();
  const c = f.controller();
  const initial = c.getSnapshot();
  c.tick();
  assert.equal(c.getSnapshot(), initial);
  let changes = 0;
  const unsubscribe = c.subscribe(() => { changes++; });
  c.start(task);
  assert.ok(changes > 0);
  unsubscribe();
  const count = changes;
  c.discard();
  assert.equal(changes, count);
  assert.equal(f.entries.size, 0);
});

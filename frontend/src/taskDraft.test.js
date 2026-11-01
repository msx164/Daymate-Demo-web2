import test from "node:test";
import assert from "node:assert/strict";
import { validateTaskDraft, validTaskDate, requestTaskDraft } from "./taskDraft.js";
import { createTaskDraftController } from "./taskDraftController.js";
import { createTaskSubmissionController } from "./taskSubmission.js";

const draft = { name: "复习数学", task_date: "2026-10-13", start_time: "15:00", end_time: "15:25", task_type: "学习" };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("draft validation rejects invalid dates, times, types and unsolicited operations", () => {
  assert.deepEqual(validateTaskDraft(draft, draft.task_date), draft);
  assert.equal(validTaskDate("2026-02-30"), false);
  assert.equal(validTaskDate("2028-02-29"), true);
  for (const changes of [{ task_date: "2026-10-14" }, { start_time: "25:00" }, { end_time: "1:00" },
    { task_type: "unknown" }, { name: " " }, { name: "x".repeat(201) }, { completed: true }, { id: 9 }]) {
    assert.throws(() => validateTaskDraft({ ...draft, ...changes }, draft.task_date));
  }
});
test("draft generation sends only the explicit goal and date, with no task creation", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response(JSON.stringify(draft)); };
  try {
    assert.deepEqual(await requestTaskDraft("study", draft.task_date), draft);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/ai/task-draft"));
    assert.deepEqual(calls[0].body, { goal: "study", task_date: draft.task_date });
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "invalid model output" }), { status: 502 });
    await assert.rejects(requestTaskDraft("study", draft.task_date), /invalid model output/);
  } finally { globalThis.fetch = original; }
});
test("generation locks repeated clicks and does not save a task", async () => {
  const pending = deferred(); let calls = 0;
  const c = createTaskDraftController(async () => { calls++; return pending.promise; });
  const first = c.generate("study", draft.task_date);
  assert.equal(await c.generate("duplicate", draft.task_date), false);
  assert.equal(c.getSnapshot().busy, true);
  pending.resolve(draft); await first;
  assert.equal(calls, 1);
  assert.deepEqual(c.getSnapshot().draft, draft);
});
test("cancel ignores late generated drafts, and a new generation can succeed", async () => {
  const pending = deferred(); let calls = 0; let signal;
  const c = createTaskDraftController(async (_goal, _date, requestSignal) => {
    signal = requestSignal; return calls++ === 0 ? pending.promise : draft;
  });
  const first = c.generate("old", draft.task_date);
  c.cancel();
  assert.equal(signal.aborted, true);
  await c.generate("new", draft.task_date);
  pending.resolve({ ...draft, name: "stale" }); await first;
  assert.equal(c.getSnapshot().draft.name, draft.name);
  assert.equal(c.getSnapshot().goal, "new");
});
test("generation errors remain visible and invalid input makes no request", async () => {
  let calls = 0;
  const c = createTaskDraftController(async () => { calls++; throw Error("offline"); });
  assert.equal(await c.generate(" ", draft.task_date), false);
  assert.equal(await c.generate("study", "2026-02-30"), false);
  assert.equal(calls, 0);
  await c.generate("study", draft.task_date);
  assert.match(c.getSnapshot().error, /offline/);
  assert.equal(c.getSnapshot().busy, false);
});
test("task creation requires explicit submit and saves reviewed edits exactly once", async () => {
  const pending = deferred(); const c = createTaskSubmissionController();
  let calls = 0;
  const edited = { ...draft, name: "审核后修改的目标" };
  assert.equal(calls, 0);
  const first = c.submit(edited, async (task) => { calls++; assert.deepEqual(task, edited); await pending.promise; });
  assert.equal(await c.submit(edited, () => { calls++; }), false);
  pending.resolve(); assert.equal(await first, true);
  assert.equal(await c.submit(edited, () => { calls++; }), false);
  assert.equal(calls, 1);
});
test("unconfirmed creation prevents blind retry after network or server failure", async () => {
  for (const error of [new TypeError("network"), Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    Object.assign(new Error("server"), { status: 500 })]) {
    let calls = 0;
    const c = createTaskSubmissionController();
    assert.equal(await c.submit(draft, async () => { calls++; throw error; }), false);
    assert.equal(c.getSnapshot().uncertain, true);
    assert.equal(await c.submit(draft, () => { calls++; }), false);
    assert.equal(calls, 1);
  }
});
test("definite validation failure allows editing and retrying a task", async () => {
  const c = createTaskSubmissionController();
  await c.submit(draft, async () => { throw Object.assign(new Error("validation"), { status: 422 }); });
  assert.equal(c.getSnapshot().uncertain, false);
  assert.equal(c.getSnapshot().created, false);
  assert.equal(await c.submit(draft, async () => {}), true);
});

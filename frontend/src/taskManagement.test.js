import test from "node:test";
import assert from "node:assert/strict";
import { taskConflicts } from "./taskConflicts.js";
import { createTaskSubmissionController } from "./taskSubmission.js";

const task = { id: 1, name: "study", task_date: "2026-10-13", start_time: "15:00", end_time: "16:00", task_type: "学习", completed: false };
test("conflicts detect overlap, exclude self/completed tasks and allow adjacent schedules", () => {
  assert.equal(taskConflicts(task, [task], 1).length, 0);
  assert.equal(taskConflicts(task, [{ ...task, id: 2, start_time: "15:30" }]).length, 1);
  assert.equal(taskConflicts(task, [{ ...task, id: 2, completed: true }]).length, 0);
  assert.equal(taskConflicts(task, [{ ...task, id: 2, start_time: "16:00", end_time: "17:00" }]).length, 0);
  assert.equal(taskConflicts(task, [{ ...task, id: 2, task_date: "2026-10-14" }]).length, 0);
});
test("overnight tasks overlap next-day tasks and equal times are zero-length", () => {
  const overnight = { ...task, start_time: "23:30", end_time: "01:00" };
  const next = { ...task, id: 2, task_date: "2026-10-14", start_time: "00:30", end_time: "01:30" };
  assert.equal(taskConflicts(overnight, [next]).length, 1);
  assert.equal(taskConflicts(next, [overnight]).length, 1);
  assert.equal(taskConflicts({ ...task, end_time: "15:00" }, [task]).length, 0);
});
test("uncertain idempotent creation retries the frozen payload and original request key", async () => {
  const calls = [];
  const c = createTaskSubmissionController({ idempotent: true, newKey: () => "one-key" });
  await c.submit(task, async (payload, key) => { calls.push({ payload, key }); throw new TypeError("lost reply"); });
  assert.equal(c.getSnapshot().uncertain, true);
  assert.equal(await c.submit({ ...task, name: "changed" }, async (payload, key) => calls.push({ payload, key })), true);
  assert.equal(calls[0].key, "one-key");
  assert.deepEqual(calls[0], calls[1]);
});
test("definite failure permits a new request key and revised task fields", async () => {
  let keys = 0;
  const c = createTaskSubmissionController({ idempotent: true, newKey: () => `key-${++keys}` });
  await c.submit(task, async () => { throw Object.assign(new Error("validation"), { status: 422 }); });
  await c.submit({ ...task, name: "revised" }, async (payload, key) => {
    assert.equal(key, "key-2"); assert.equal(payload.name, "revised");
  });
});

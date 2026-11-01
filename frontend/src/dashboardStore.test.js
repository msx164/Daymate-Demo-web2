import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardStore, validateDashboard } from "./dashboardStore.js";

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const data = { tasks: [{ id: 1, completed: false }] };
test("older response cannot overwrite a newer dashboard even if it ignores abort", async () => {
  const a = deferred(), b = deferred();
  const signals = [];
  const queue = [a, b];
  const store = createDashboardStore((signal) => { signals.push(signal); return queue.shift().promise; });
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(signals[0].aborted, true);
  b.resolve(data);
  await second;
  a.resolve({ tasks: [] });
  await first;
  assert.equal(store.getSnapshot().data, data);
});
test("task mutation invalidates an in-flight read and preserves changed state", async () => {
  const late = deferred();
  let calls = 0;
  const store = createDashboardStore(() => calls++ === 0 ? Promise.resolve(data) : late.promise);
  await store.refresh();
  const loading = store.refresh();
  store.updateTasks((tasks) => tasks.map((task) => ({ ...task, completed: true })));
  late.resolve(data);
  await loading;
  assert.equal(store.getSnapshot().data.tasks[0].completed, true);
  assert.equal(store.getSnapshot().loading, false);
});
test("failed read preserves last good data and a later retry clears error", async () => {
  let failed = false;
  const store = createDashboardStore(async () => { if (failed) throw Error("offline"); return data; });
  await store.refresh();
  failed = true;
  await store.refresh();
  assert.equal(store.getSnapshot().data, data);
  assert.match(store.getSnapshot().error, /offline/);
  failed = false;
  await store.refresh();
  assert.equal(store.getSnapshot().error, "");
});
test("cleanup rejects late commits and StrictMode restart can load normally", async () => {
  const late = deferred();
  let calls = 0;
  const store = createDashboardStore(() => calls++ === 0 ? late.promise : Promise.resolve(data));
  const first = store.refresh();
  store.dispose();
  await store.refresh();
  late.reject(Error("aborted"));
  await first;
  assert.equal(store.getSnapshot().data, data);
  assert.equal(store.getSnapshot().error, "");
});
test("malformed payloads fail validation before rendering", () => {
  const payload = [[], { total_seconds: 0, today_seconds: 0, today_date: "2026-10-11" }, [],
    [{ date: "2026-10-11", seconds: 1 }], { companion_days: 1 }, { streak_days: 1 }];
  assert.equal(validateDashboard(payload).week[0].seconds, 1);
  for (const index of [0, 1, 2, 3, 4, 5]) {
    const broken = [...payload];
    broken[index] = null;
    assert.throws(() => validateDashboard(broken));
  }
  assert.throws(() => validateDashboard([{ ...data }, ...payload.slice(1)]));
  assert.throws(() => validateDashboard([[], { ...payload[1], today_seconds: NaN }, ...payload.slice(2)]));
  assert.throws(() => validateDashboard([[], payload[1], [{ id: 1, task_name: "x", seconds: 2, started_at: "invalid", ended_at: "invalid" }], ...payload.slice(3)]));
});

import test from "node:test";
import assert from "node:assert/strict";
import { request, saveFocus } from "./api.js";

test("zero-second exit makes no request; completion sets explicit state", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ completed: true }) };
  };
  try {
    await saveFocus({ seconds: 0, task_id: 9, complete_task: false });
    assert.equal(calls.length, 0);
    await saveFocus({ seconds: 0, task_id: 9, complete_task: true });
    assert.equal(calls[0].options.method, "PUT");
    assert.deepEqual(JSON.parse(calls[0].options.body), { completed: true });
    const snapshot = { task_id: 9, seconds: 4, session_key: "one", complete_task: true };
    await saveFocus(snapshot);
    assert.equal(calls[1].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[1].options.body), snapshot);
  } finally {
    globalThis.fetch = original;
  }
});

test("API failures expose server validation errors", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 422, json: async () => ({ detail: [{ msg: "名称不能为空" }] }),
  });
  try {
    await assert.rejects(request("/api/tasks"), /名称不能为空/);
  } finally {
    globalThis.fetch = original;
  }
});

test("caller cancellation retains the request timeout instead of replacing it", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const timeout = new AbortController();
  const caller = new AbortController();
  AbortSignal.timeout = (milliseconds) => { assert.equal(milliseconds, 15000); return timeout.signal; };
  globalThis.fetch = async (_url, options) => {
    assert.notEqual(options.signal, caller.signal);
    timeout.abort(new Error("timeout"));
    options.signal.throwIfAborted();
  };
  try {
    await assert.rejects(request("/api/tasks", { signal: caller.signal }), /timeout/);
    assert.equal(caller.signal.aborted, false);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

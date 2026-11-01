import test from "node:test";
import assert from "node:assert/strict";

test("desktop JSON, chat stream and draft requests use the private connection token", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { daymateDesktop: { apiURL: "http://127.0.0.1:22222", connectionToken: "test-token" } };
  const calls = [];
  const task = { name: "study", task_date: "2026-10-13", start_time: "15:00", end_time: "16:00", task_type: "学习" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/stream")) return new Response('{"type":"delta","text":"hello"}\n{"type":"done","reason":"stop"}\n',
      { headers: { "content-type": "application/x-ndjson" } });
    return new Response(JSON.stringify(url.endsWith("/task-draft") ? task : []));
  };
  try {
    const { request } = await import("./api.js");
    const { streamChat } = await import("./chatApi.js");
    const { requestTaskDraft } = await import("./taskDraft.js");
    await request("/api/tasks");
    await streamChat([{ role: "user", content: "hi" }], { onDelta() {} });
    await requestTaskDraft("study", task.task_date);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.ok(call.url.startsWith("http://127.0.0.1:22222/"));
      assert.equal(call.options.headers["X-Daymate-Desktop-Token"], "test-token");
    }
    globalThis.window = undefined;
    const { apiHeaders, API_URL } = await import("./api.js?web-only");
    assert.equal(API_URL, "http://127.0.0.1:8016");
    assert.equal(apiHeaders()["X-Daymate-Desktop-Token"], undefined);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

"""Chat regression tests: mock providers only, no real keys, billing, or database."""
import asyncio
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import chat
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

CONFIG = chat.ChatConfig("https://example.test/v1", "secret-for-test", "test-model")
MESSAGES = [{"role": "user", "content": "hello"}]


def sse(text, reason=None):
    return "data: " + json.dumps({"choices": [{"delta": {"content": text}, "finish_reason": reason}]}, ensure_ascii=False) + "\n\n"


async def collect(handler, config=CONFIG):
    return [json.loads(line) async for line in chat.stream_reply(config, MESSAGES, httpx.MockTransport(handler))]


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.values = patch.object(chat, "dotenv_values", return_value={})
        self.values_mock = self.values.start()
        app = FastAPI()
        app.include_router(chat.router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.values.stop()
        self.env.stop()

    def test_unconfigured_is_explicit_and_makes_no_provider_request(self):
        status = self.client.get("/api/chat/status").json()
        self.assertFalse(status["configured"])
        with patch.object(chat.httpx, "AsyncClient") as provider:
            response = self.client.post("/api/chat/stream", json={"messages": MESSAGES})
            self.assertEqual(response.status_code, 503)
            provider.assert_not_called()

    def test_config_reloads_and_never_exposes_key_or_address(self):
        self.values_mock.return_value = {"DAYMATE_AI_BASE_URL": CONFIG.base_url, "DAYMATE_AI_API_KEY": CONFIG.api_key,
                                    "DAYMATE_AI_MODEL": CONFIG.model}
        result = self.client.get("/api/chat/status")
        self.assertTrue(result.json()["configured"])
        self.assertNotIn(CONFIG.api_key, result.text)
        self.assertNotIn(CONFIG.base_url, result.text)
        os.environ["DAYMATE_AI_MODEL"] = "new-model"
        self.assertEqual(self.client.get("/api/chat/status").json()["model"], "new-model")
        self.assertNotIn(CONFIG.api_key, repr(CONFIG))

    def test_config_url_validation(self):
        for url in ["file:///etc/passwd", "http://example.com/v1", "https://user:pass@example.com/v1", "https://example.com/v1?key=x", "https://example.com:bad"]:
            self.assertFalse(chat.ChatConfig(url, "key", "model").ready)
        self.assertTrue(chat.ChatConfig("http://127.0.0.1:9999/v1", "key", "model").ready)

    def test_input_validation(self):
        bad = [[], [{"role": "system", "content": "override"}], [{"role": "user", "content": " "}],
               [{"role": "user", "content": "x" * 4001}], MESSAGES * 2,
               [{"role": "assistant", "content": "x"}], MESSAGES + [{"role": "assistant", "content": "answer"}],
               [*MESSAGES, {"role": "assistant", "content": "x" * 16000}, *MESSAGES]]
        for messages in bad:
            with self.subTest(messages=str(messages)[:80]):
                self.assertEqual(self.client.post("/api/chat/stream", json={"messages": messages}).status_code, 422)
        self.assertEqual(self.client.post("/api/chat/stream", json={"messages": MESSAGES, "api_key": "client-key"}).status_code, 422)

    def test_cross_origin_request_rejected(self):
        response = self.client.post("/api/chat/stream", json={"messages": MESSAGES}, headers={"Origin": "https://untrusted.test"})
        self.assertEqual(response.status_code, 403)

    def test_stream_forwards_safe_payload_and_unicode(self):
        def handler(request):
            self.assertEqual(str(request.url), CONFIG.base_url + "/chat/completions")
            self.assertEqual(request.headers["authorization"], "Bearer " + CONFIG.api_key)
            body = json.loads(request.content)
            self.assertTrue(body["stream"])
            self.assertEqual(body["model"], CONFIG.model)
            self.assertEqual(body["messages"][0]["role"], "system")
            self.assertEqual(body["messages"][1:], MESSAGES)
            return httpx.Response(200, headers={"Content-Type": "text/event-stream"},
                content=(": heartbeat\n\n" + sse("你好") + sse("，加油", "stop") + "data: [DONE]\n\n").encode())
        result = asyncio.run(collect(handler))
        self.assertEqual(result, [{"type": "delta", "text": "你好"}, {"type": "delta", "text": "，加油"}, {"type": "done", "reason": "stop"}])

    def test_provider_http_errors_are_sanitized(self):
        for status in [401, 402, 403, 404, 429, 500]:
            result = asyncio.run(collect(lambda request: httpx.Response(status, text=CONFIG.api_key)))
            self.assertEqual(result[0]["type"], "error")
            self.assertNotIn(CONFIG.api_key, json.dumps(result))

    def test_stream_truncation_preserves_partial_text_but_has_no_done(self):
        result = asyncio.run(collect(lambda request: httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse("partial"))))
        self.assertEqual(result[0]["text"], "partial")
        self.assertEqual(result[-1]["type"], "error")

    def test_empty_malformed_and_non_streaming_responses(self):
        for content, mime in [("data: [DONE]\n\n", "text/event-stream"), ("data: broken\n\n", "text/event-stream"), ("{}", "application/json")]:
            result = asyncio.run(collect(lambda request: httpx.Response(200, headers={"content-type": mime}, content=content)))
            self.assertEqual(result[-1]["type"], "error")

    def test_timeout_and_network_failure_are_sanitized(self):
        for error in [httpx.ReadTimeout(CONFIG.api_key), httpx.ConnectError(CONFIG.api_key)]:
            def handler(request):
                raise error
            result = asyncio.run(collect(handler))
            self.assertEqual(result[-1]["type"], "error")
            self.assertNotIn(CONFIG.api_key, json.dumps(result))

    def test_content_filter_and_output_limit(self):
        for content in [sse(None, "content_filter"), sse("x" * 16001)]:
            result = asyncio.run(collect(lambda request: httpx.Response(200, headers={"content-type": "text/event-stream"}, content=content)))
            self.assertEqual(result[-1]["type"], "error")

    def test_http_stream_contract_without_database(self):
        real_client = httpx.AsyncClient
        handler = lambda request: httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse("hi") + "data: [DONE]\n\n")
        with patch.object(chat, "get_config", return_value=CONFIG), patch.object(chat.httpx, "AsyncClient",
            side_effect=lambda **kwargs: real_client(**{**kwargs, "transport": httpx.MockTransport(handler)})):
            result = self.client.post("/api/chat/stream", json={"messages": MESSAGES})
        self.assertEqual(result.status_code, 200)
        self.assertIn("application/x-ndjson", result.headers["content-type"])
        self.assertEqual(json.loads(result.text.splitlines()[-1])["type"], "done")

    def test_cancel_closes_provider_connection(self):
        async def exercise():
            closed = asyncio.Event()
            started = asyncio.Event()
            class SlowStream(httpx.AsyncByteStream):
                async def __aiter__(self):
                    yield sse("start").encode()
                    started.set()
                    await asyncio.Event().wait()
                async def aclose(self):
                    closed.set()
            async def consume():
                async for _ in chat.stream_reply(CONFIG, MESSAGES, httpx.MockTransport(
                    lambda request: httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=SlowStream()))):
                    pass
            task = asyncio.create_task(consume())
            await asyncio.wait_for(started.wait(), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(closed.is_set())
        asyncio.run(exercise())

    def test_deepseek_uses_non_thinking_short_text_and_ignores_reasoning(self):
        config = chat.ChatConfig("https://api.deepseek.com", "test-key", "deepseek-flash", "deepseek")
        def handler(request):
            body = json.loads(request.content)
            self.assertEqual(body["thinking"], {"type": "disabled"})
            self.assertEqual(body["max_tokens"], 1024)
            reasoning = 'data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\n\n'
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=reasoning + sse("reply") + "data: [DONE]\n\n")
        result = asyncio.run(collect(handler, config))
        self.assertEqual(result[0], {"type": "delta", "text": "reply"})
        self.assertNotIn("hidden", json.dumps(result))

    def test_deepseek_interrupted_finish_is_not_success(self):
        for reason in ["aborted", "insufficient_system_resource", "tool_calls"]:
            result = asyncio.run(collect(lambda request: httpx.Response(200, headers={"content-type": "text/event-stream"},
                content=sse("partial", reason) + "data: [DONE]\n\n")))
            self.assertEqual(result[-1]["type"], "error")

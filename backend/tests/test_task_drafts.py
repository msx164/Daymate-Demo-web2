import asyncio
from datetime import date
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import chat
import task_drafts
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

DRAFT = {"name": "复习数学", "task_date": "2026-10-13", "start_time": "15:00", "end_time": "15:25", "task_type": "学习"}
BODY = {"goal": "study", "task_date": "2026-10-13"}
CONFIG = chat.ChatConfig("https://example.test/v1", "test-secret", "test-model")


def response_stream(text, reason="stop"):
    async def stream(*args, **kwargs):
        yield chat.event("delta", text=text)
        yield chat.event("done", reason=reason)
    return stream


class TaskDraftTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(task_drafts.router)
        self.client = TestClient(app)
        self.config = patch.object(chat, "get_config", return_value=CONFIG)
        self.config.start()

    def tearDown(self):
        self.config.stop()
        self.client.close()

    def test_parsing_plain_and_fenced_json(self):
        text = json.dumps(DRAFT)
        for value in [text, "```json\n" + text + "\n```"]:
            self.assertEqual(task_drafts.parse_task_draft(value, date(2026, 10, 13)).name, DRAFT["name"])

    def test_invalid_output_rejected_without_exposing_provider_text(self):
        for changes in [{"name": " "}, {"start_time": "24:00"}, {"task_type": "other"},
                        {"task_date": "2026-10-14"}, {"completed": True}, {"id": 1}]:
            with patch.object(task_drafts, "stream_reply", response_stream(json.dumps({**DRAFT, **changes}))):
                response = self.client.post("/api/ai/task-draft", json=BODY)
            self.assertEqual(response.status_code, 502)
            self.assertIn("草稿格式无效", response.json()["detail"])
        with patch.object(task_drafts, "stream_reply", response_stream("not-json test-secret")):
            response = self.client.post("/api/ai/task-draft", json=BODY)
        self.assertNotIn("test-secret", response.text)

    def test_only_goal_sent_with_requested_date_in_system_prompt(self):
        async def stream(config, messages, **kwargs):
            self.assertEqual(messages, [{"role": "user", "content": BODY["goal"]}])
            self.assertIn(BODY["task_date"], kwargs["system_prompt"])
            yield chat.event("delta", text=json.dumps(DRAFT))
            yield chat.event("done", reason="stop")
        with patch.object(task_drafts, "stream_reply", stream):
            response = self.client.post("/api/ai/task-draft", json=BODY)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), DRAFT)

    def test_input_and_origin_validation(self):
        for body in [{**BODY, "goal": " "}, {**BODY, "goal": "x" * 4001}, {**BODY, "task_date": "2026-02-30"}, {**BODY, "completed": True}]:
            self.assertEqual(self.client.post("/api/ai/task-draft", json=body).status_code, 422)
        self.assertEqual(self.client.post("/api/ai/task-draft", json=BODY, headers={"Origin": "https://untrusted.test"}).status_code, 403)

    def test_unconfigured_makes_no_model_request(self):
        with patch.object(chat, "get_config", return_value=chat.ChatConfig()), patch.object(task_drafts, "stream_reply") as stream:
            self.assertEqual(self.client.post("/api/ai/task-draft", json=BODY).status_code, 503)
            stream.assert_not_called()

    def test_truncated_empty_oversized_and_failed_generation(self):
        for text, reason in [(json.dumps(DRAFT), "length"), ("", "stop"), ("x" * 4001, "stop")]:
            with patch.object(task_drafts, "stream_reply", response_stream(text, reason)):
                self.assertEqual(self.client.post("/api/ai/task-draft", json=BODY).status_code, 502)
        async def failed(*args, **kwargs):
            yield chat.event("error", message="offline")
        with patch.object(task_drafts, "stream_reply", failed):
            response = self.client.post("/api/ai/task-draft", json=BODY)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "offline")

    def test_disconnect_cancels_generation(self):
        async def exercise():
            started, stopped = asyncio.Event(), asyncio.Event()
            async def generation(*args):
                started.set()
                try: await asyncio.Event().wait()
                finally: stopped.set()
            async def disconnect(request):
                await started.wait()
            request = type("LocalRequest", (), {"headers": {}})()
            with patch.object(task_drafts, "generate_task_draft", generation), patch.object(task_drafts, "wait_for_disconnect", disconnect):
                with self.assertRaises(HTTPException) as result:
                    await task_drafts.task_draft(task_drafts.DraftInput(**BODY), request)
                self.assertEqual(result.exception.status_code, 499)
            self.assertTrue(stopped.is_set())
        asyncio.run(exercise())

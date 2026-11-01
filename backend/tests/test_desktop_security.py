import os
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from desktop_security import DesktopTokenMiddleware, allowed_origins


class DesktopSecurityTests(unittest.TestCase):
    def test_optional_token_and_existing_web_compatibility(self):
        for token in ["", "test-token"]:
            app = FastAPI()
            app.add_middleware(DesktopTokenMiddleware, token=token)
            @app.get("/")
            def root():
                return {"ok": True}
            with TestClient(app) as client:
                self.assertEqual(client.get("/").status_code, 401 if token else 200)
                self.assertEqual(client.get("/", headers={"X-Daymate-Desktop-Token": "test-token"}).status_code, 200)
                if token:
                    self.assertEqual(client.get("/", headers={"X-Daymate-Desktop-Token": "wrong"}).status_code, 401)

    def test_only_loopback_desktop_origin_added(self):
        with patch.dict(os.environ, {"DAYMATE_DESKTOP_ORIGIN": "http://127.0.0.1:18765"}):
            self.assertIn("http://127.0.0.1:18765", allowed_origins())
        for origin in ["http://evil.test:18765", "http://127.0.0.1:18765/path", "http://127.0.0.1:bad"]:
            with patch.dict(os.environ, {"DAYMATE_DESKTOP_ORIGIN": origin}):
                self.assertEqual(len(allowed_origins()), 2)

"""HTTP regression tests using a disposable legacy database, never daymate.db."""
import concurrent.futures
from contextlib import closing
import importlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="daymate-tests-")
        cls.path = Path(cls.temp.name) / "legacy.db"
        cls.previous_path = os.environ.get("DAYMATE_DB_PATH")
        os.environ["DAYMATE_DB_PATH"] = str(cls.path)
        with closing(sqlite3.connect(cls.path)) as db:
            db.executescript("""
                CREATE TABLE tasks (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL,
                    start_time VARCHAR NOT NULL, end_time VARCHAR NOT NULL,
                    task_type VARCHAR NOT NULL, completed BOOLEAN);
                CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL,
                    minutes INTEGER NOT NULL, seconds INTEGER NOT NULL,
                    started_at DATETIME NOT NULL, ended_at DATETIME NOT NULL, created_at DATETIME);
                INSERT INTO tasks VALUES (1, 'legacy', '15:00', '16:00', 'study', 0);
                INSERT INTO focus_sessions VALUES (1, 1, 0, 17,
                    '2026-10-10 12:00:00.000000', '2026-10-10 12:00:17.000000',
                    '2026-10-10 20:00:17.000000');
            """)
            cls.legacy_rows = db.execute("SELECT * FROM focus_sessions").fetchall()
        cls.database = importlib.import_module("database")
        if cls.database.DB_PATH != cls.path.resolve():
            raise RuntimeError("Refusing API tests: database module does not point at the disposable test database")
        cls.main = importlib.import_module("main")
        import uvicorn
        cls.sock = socket.socket()
        cls.sock.bind(("127.0.0.1", 0))
        cls.base = f"http://127.0.0.1:{cls.sock.getsockname()[1]}"
        cls.server = uvicorn.Server(uvicorn.Config(cls.main.app, log_level="critical", lifespan="off"))
        cls.thread = threading.Thread(target=lambda: cls.server.run(sockets=[cls.sock]), daemon=True)
        cls.thread.start()
        deadline = time.monotonic() + 5
        while not cls.server.started:
            if time.monotonic() > deadline:
                raise RuntimeError("Test server failed to start")
            time.sleep(0.02)

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(5)
        cls.sock.close()
        cls.database.engine.dispose()
        if cls.previous_path is None:
            os.environ.pop("DAYMATE_DB_PATH", None)
        else:
            os.environ["DAYMATE_DB_PATH"] = cls.previous_path
        cls.temp.cleanup()

    def request(self, method, path, data=None, origin=None, key=None):
        headers = {"Content-Type": "application/json"}
        if key is not None:
            headers["Idempotency-Key"] = key
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(self.base + path, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            text = response.read().decode()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                data = text
            return response.status, data, dict(response.headers)

    def task(self):
        status, task, _ = self.request("POST", "/api/tasks", {
            "name": " test ", "start_time": "15:00", "end_time": "16:00", "task_type": "study",
        })
        self.assertEqual(status, 200)
        self.assertEqual(task["name"], "test")
        return task["id"]

    def test_task_create_key_retries_concurrently_and_survives_edits(self):
        payload = {"name": "keyed", "task_date": "2026-10-13", "start_time": "15:00", "end_time": "16:00", "task_type": "学习"}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: self.request("POST", "/api/tasks", payload, key="task-key"), range(6)))
        self.assertTrue(all(item[0] == 200 for item in results))
        self.assertEqual(len({item[1]["id"] for item in results}), 1)
        task_id = results[0][1]["id"]
        self.assertEqual(self.request("POST", "/api/tasks", {**payload, "name": "different"}, key="task-key")[0], 409)
        self.assertEqual(self.request("PATCH", f"/api/tasks/{task_id}", {**payload, "name": "edited"})[0], 200)
        self.database.engine.dispose()  # Replay works after the connection pool is recreated.
        replay = self.request("POST", "/api/tasks", payload, key="task-key")
        self.assertEqual(replay[1]["name"], "edited")
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM tasks WHERE create_key='task-key'").fetchone()[0], 1)
            self.assertEqual(json.loads(db.execute("SELECT create_payload FROM tasks WHERE create_key='task-key'").fetchone()[0]), payload)

    def test_edit_delete_restore_keeps_completion_and_focus_history(self):
        task_id = self.task()
        self.request("PUT", f"/api/tasks/{task_id}", {"completed": True})
        self.request("POST", "/api/focus-sessions", {"task_id": task_id, "seconds": 2,
            "started_at": "2026-10-13T07:00:00Z", "ended_at": "2026-10-13T07:00:02Z"})
        edited = {"name": "renamed", "task_date": "2026-10-14", "start_time": "23:30", "end_time": "00:30", "task_type": "工作"}
        result = self.request("PATCH", f"/api/tasks/{task_id}", edited)
        self.assertEqual(result[0], 200); self.assertTrue(result[1]["completed"])
        self.request("DELETE", f"/api/tasks/{task_id}")
        self.assertNotIn(task_id, {task["id"] for task in self.request("GET", "/api/tasks")[1]})
        self.assertIn(task_id, {task["id"] for task in self.request("GET", "/api/tasks?deleted=true")[1]})
        self.assertEqual(self.request("PATCH", f"/api/tasks/{task_id}", edited)[0], 404)
        for _ in range(2):
            restored = self.request("POST", f"/api/tasks/{task_id}/restore")
            self.assertEqual(restored[0], 200); self.assertTrue(restored[1]["completed"])
            self.assertEqual(restored[1]["name"], "renamed")
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT task_name FROM focus_sessions WHERE task_id=?", (task_id,)).fetchone()[0], "test")

    def test_deleted_keyed_task_not_recreated_by_retry(self):
        payload = {"name": "deleted keyed", "task_date": "2026-10-13", "start_time": "15:00", "end_time": "16:00", "task_type": "学习"}
        task_id = self.request("POST", "/api/tasks", payload, key="deleted-task-key")[1]["id"]
        self.request("DELETE", f"/api/tasks/{task_id}")
        self.assertEqual(self.request("POST", "/api/tasks", payload, key="deleted-task-key")[0], 410)
        self.request("POST", f"/api/tasks/{task_id}/restore")
        self.assertEqual(self.request("POST", "/api/tasks", payload, key="deleted-task-key")[1]["id"], task_id)
        self.assertEqual(self.request("POST", "/api/tasks/999999/restore")[0], 404)
        self.assertEqual(self.request("POST", "/api/tasks", payload, key="x" * 101)[0], 422)

    def focus(self, key, **changes):
        return dict({"task_id": self.task(), "seconds": 65,
                     "started_at": "2026-10-11T08:00:00Z", "ended_at": "2026-10-11T08:01:05Z",
                     "session_key": key, "complete_task": False}, **changes)

    def test_migration_preserves_rows_and_is_repeatable(self):
        with closing(sqlite3.connect(self.path)) as db:
            rows = db.execute("SELECT id,task_id,minutes,seconds,started_at,ended_at,created_at FROM focus_sessions WHERE id=1").fetchall()
            self.assertEqual(rows, self.legacy_rows)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("SELECT create_key,create_payload FROM tasks WHERE id=1").fetchone(), (None, None))
        backups = list((self.path.parent / "backups").glob("*.db"))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as db:
            self.assertEqual(db.execute("SELECT * FROM focus_sessions").fetchall(), self.legacy_rows)
        self.database.initialize_database()
        self.assertEqual(len(list((self.path.parent / "backups").glob("*.db"))), 1)

    def test_ai_draft_is_readonly_and_reviewed_fields_create_normal_task(self):
        from unittest.mock import patch
        import chat
        import task_drafts
        draft = {"name": "draft", "task_date": "2026-10-13", "start_time": "15:00", "end_time": "15:25", "task_type": "学习"}
        async def stream(*args, **kwargs):
            yield chat.event("delta", text=json.dumps(draft))
            yield chat.event("done", reason="stop")
        with closing(sqlite3.connect(self.path)) as db:
            before_tasks = db.execute("SELECT * FROM tasks ORDER BY id").fetchall()
            before_focus = db.execute("SELECT * FROM focus_sessions ORDER BY id").fetchall()
        with patch.object(chat, "get_config", return_value=chat.ChatConfig("https://example.test/v1", "test-key", "test-model")), \
             patch.object(task_drafts, "stream_reply", stream):
            status, proposal, _ = self.request("POST", "/api/ai/task-draft", {"goal": "test", "task_date": draft["task_date"]})
        self.assertEqual(status, 200)
        self.assertEqual(proposal, draft)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT * FROM tasks ORDER BY id").fetchall(), before_tasks)
            self.assertEqual(db.execute("SELECT * FROM focus_sessions ORDER BY id").fetchall(), before_focus)
        proposal["name"] = "reviewed and edited"
        status, created, _ = self.request("POST", "/api/tasks", proposal)
        self.assertEqual(status, 200)
        self.assertEqual(created["name"], proposal["name"])
        self.assertEqual(created["task_date"], proposal["task_date"])
        self.assertFalse(created["completed"])
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM tasks").fetchone()[0], len(before_tasks) + 1)
            self.assertEqual(db.execute("SELECT * FROM focus_sessions ORDER BY id").fetchall(), before_focus)

    def test_legacy_time_has_explicit_utc_and_no_rewrite(self):
        from sqlalchemy.orm import Session
        import models
        with Session(self.database.engine) as db:
            data = self.main.session_response(db.get(models.FocusSession, 1))
            self.assertEqual(data["started_at"].isoformat(), "2026-10-10T12:00:00+00:00")

    def test_stage_one_migration_preserves_retry_metadata(self):
        from sqlalchemy import create_engine
        path = Path(self.temp.name) / "stage-one.db"
        backup = next((self.path.parent / "backups").glob("*.db"))
        with closing(sqlite3.connect(backup)) as source:
            with closing(sqlite3.connect(path)) as target:
                source.backup(target)
                target.executescript("""
                    ALTER TABLE focus_sessions ADD COLUMN session_key VARCHAR;
                    ALTER TABLE focus_sessions ADD COLUMN completes_task BOOLEAN NOT NULL DEFAULT 0;
                    UPDATE focus_sessions SET session_key='existing-key', completes_task=1 WHERE id=1;
                    INSERT INTO focus_sessions VALUES (2, 999, 0, 5,
                        '2026-10-10 12:00:00.000000', '2026-10-10 12:00:05.000000',
                        '2026-10-10 20:00:05.000000', NULL, 0);
                """)
                before = target.execute("SELECT * FROM focus_sessions").fetchall()
        previous_engine, previous_path = self.database.engine, self.database.DB_PATH
        engine = create_engine("sqlite:///" + path.as_posix())
        self.database.engine, self.database.DB_PATH = engine, path
        try:
            self.database.initialize_database()
            with closing(sqlite3.connect(path)) as db:
                after = db.execute("SELECT id,task_id,minutes,seconds,started_at,ended_at,created_at,session_key,completes_task FROM focus_sessions").fetchall()
                self.assertEqual(after, before)
                self.assertEqual(db.execute("SELECT task_name,planned_seconds FROM focus_sessions WHERE id=1").fetchone(), ("legacy", None))
                self.assertEqual(db.execute("SELECT task_name FROM focus_sessions WHERE id=2").fetchone()[0], "已删除任务")
                self.assertEqual(db.execute("SELECT task_date FROM tasks WHERE id=1").fetchone()[0], str(self.main.today_local()))
            self.database.initialize_database()
        finally:
            self.database.engine, self.database.DB_PATH = previous_engine, previous_path
            engine.dispose()

    def test_retry_is_one_record_and_completion_is_atomic(self):
        payload = self.focus("retry", complete_task=True)
        status, first, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        status, second, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["minutes"], 1)
        self.assertTrue(first["started_at"].endswith("+00:00"))
        tasks = self.request("GET", "/api/tasks")[1]
        self.assertTrue(next(t for t in tasks if t["id"] == payload["task_id"])["completed"])
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM focus_sessions WHERE session_key='retry'").fetchone()[0], 1)

    def test_concurrent_retries(self):
        payload = self.focus("parallel", complete_task=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: self.request("POST", "/api/focus-sessions", payload), range(6)))
        self.assertTrue(all(status == 200 for status, _, _ in results))
        self.assertEqual(len({data["id"] for _, data, _ in results}), 1)

    def test_completion_failure_rolls_back_record_and_can_retry(self):
        payload = self.focus("transaction", complete_task=True)
        with closing(sqlite3.connect(self.path)) as db:
            db.execute(f"""CREATE TRIGGER reject_completion BEFORE UPDATE OF completed ON tasks
                WHEN NEW.id={payload['task_id']} BEGIN SELECT RAISE(ABORT, 'test failure'); END""")
            db.commit()
        try:
            self.assertEqual(self.request("POST", "/api/focus-sessions", payload)[0], 500)
            with closing(sqlite3.connect(self.path)) as db:
                self.assertEqual(db.execute("SELECT count(*) FROM focus_sessions WHERE session_key='transaction'").fetchone()[0], 0)
                self.assertEqual(db.execute("SELECT completed FROM tasks WHERE id=?", (payload["task_id"],)).fetchone()[0], 0)
        finally:
            with closing(sqlite3.connect(self.path)) as db:
                db.execute("DROP TRIGGER reject_completion")
                db.commit()
        self.assertEqual(self.request("POST", "/api/focus-sessions", payload)[0], 200)

    def test_conflicting_key_rejected_without_changing_record(self):
        payload = self.focus("conflict")
        self.assertEqual(self.request("POST", "/api/focus-sessions", payload)[0], 200)
        for changes in [{"seconds": 64}, {"complete_task": True}]:
            self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, **changes))[0], 409)

    def test_timezone_offsets_normalize_and_pauses_are_allowed(self):
        payload = self.focus("offset", started_at="2026-10-11T16:00:00+08:00", ended_at="2026-10-11T16:05:00+08:00")
        status, record, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        self.assertEqual(record["started_at"], "2026-10-11T08:00:00+00:00")
        self.assertEqual(record["seconds"], 65)

    def test_custom_duration_validation_and_retry(self):
        payload = self.focus("custom", seconds=1800, planned_seconds=2700,
                             ended_at="2026-10-11T08:30:00Z")
        status, first, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        self.assertEqual(first["planned_seconds"], 2700)
        self.assertEqual(self.request("POST", "/api/focus-sessions", payload)[1]["id"], first["id"])
        self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, planned_seconds=3600))[0], 409)
        for planned in [0, 59, 14401, 60.5, True]:
            self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, planned_seconds=planned))[0], 422)
        self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, planned_seconds=1200))[0], 422)

    def test_history_name_survives_rename_and_soft_delete(self):
        payload = self.focus("history")
        status, record, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        self.assertEqual(record["task_name"], "test")
        task_id = payload["task_id"]
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("UPDATE tasks SET name='renamed' WHERE id=?", (task_id,))
            db.commit()
        self.assertEqual(self.request("DELETE", f"/api/tasks/{task_id}")[0], 200)
        self.assertNotIn(task_id, [task["id"] for task in self.request("GET", "/api/tasks")[1]])
        self.assertGreater(self.task(), task_id)
        status, retry, _ = self.request("POST", "/api/focus-sessions", payload)
        self.assertEqual(status, 200)
        self.assertEqual(retry["id"], record["id"])
        self.assertEqual(retry["task_name"], "test")
        self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, session_key="deleted-new"))[0], 404)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertIsNotNone(db.execute("SELECT deleted_at FROM tasks WHERE id=?", (task_id,)).fetchone()[0])

    def test_task_dates_and_filter(self):
        task_id = self.task()
        task = next(t for t in self.request("GET", "/api/tasks")[1] if t["id"] == task_id)
        self.assertEqual(task["task_date"], str(self.main.today_local()))
        status, dated, _ = self.request("POST", "/api/tasks", {
            "name": "dated", "start_time": "10:00", "end_time": "11:00",
            "task_type": "study", "task_date": "2026-09-01",
        })
        self.assertEqual(status, 200)
        result = self.request("GET", "/api/tasks?task_date=2026-09-01")[1]
        self.assertIn(dated["id"], [t["id"] for t in result])
        self.assertNotIn(task_id, [t["id"] for t in result])
        self.assertEqual(self.request("GET", "/api/tasks?task_date=bad")[0], 422)

    def test_bad_focus_inputs(self):
        payload = self.focus("invalid")
        for changes in [{"seconds": -1}, {"seconds": 0}, {"seconds": 2.5}, {"seconds": True},
                        {"seconds": 100}, {"session_key": ""}, {"ended_at": "2026-10-10T00:00:00Z"}]:
            self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, **changes))[0], 422)
        self.assertEqual(self.request("POST", "/api/focus-sessions", dict(payload, task_id=999999))[0], 404)

    def test_bad_task_inputs(self):
        payload = {"name": "valid", "start_time": "15:00", "end_time": "16:00", "task_type": "study"}
        for changes in [{"name": "  "}, {"start_time": "25:00"}, {"end_time": "invalid"}, {"task_type": ""}]:
            self.assertEqual(self.request("POST", "/api/tasks", dict(payload, **changes))[0], 422)

    def test_explicit_completion_and_legacy_toggle(self):
        task_id = self.task()
        for _ in range(2):
            status, data, _ = self.request("PUT", f"/api/tasks/{task_id}", {"completed": True})
            self.assertEqual(status, 200)
            self.assertTrue(data["completed"])
        self.assertFalse(self.request("PUT", f"/api/tasks/{task_id}")[1]["completed"])
        self.assertEqual(self.request("DELETE", f"/api/tasks/{task_id}")[0], 200)
        self.assertEqual(self.request("PUT", f"/api/tasks/{task_id}")[0], 404)

    def test_legacy_focus_payload_and_cors(self):
        payload = self.focus("legacy")
        payload.pop("session_key")
        payload.pop("complete_task")
        self.assertEqual(self.request("POST", "/api/focus-sessions", payload)[0], 200)
        for origin in ["http://localhost:5173", "http://127.0.0.1:5173"]:
            status, _, headers = self.request("GET", "/api/tasks", origin=origin)
            self.assertEqual(status, 200)
            self.assertEqual(headers["access-control-allow-origin"], origin)

    def test_stats_endpoints(self):
        for path in ["/", "/api/hello", "/api/focus-total", "/api/focus-sessions/today",
                     "/api/focus-week", "/api/companion-days", "/api/focus-streak"]:
            self.assertEqual(self.request("GET", path)[0], 200)
        self.assertEqual(len(self.request("GET", "/api/focus-week")[1]), 7)

    def test_streak_boundaries_and_zero_seconds(self):
        from datetime import date, datetime, timedelta
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        import models
        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        previous_today = self.main.today_local
        self.main.today_local = lambda: date(2026, 10, 11)
        try:
            with Session(engine) as db:
                for offsets, expected in [([], 0), ([0], 1), ([-1], 1), ([0, -1, -2], 3),
                                           ([0, -2], 1), ([-2, -3], 0), ([0, 0, -1], 2)]:
                    db.query(models.FocusSession).delete()
                    for offset in offsets:
                        timestamp = datetime(2026, 10, 11, 12) + timedelta(days=offset)
                        db.add(models.FocusSession(task_id=1, seconds=5, minutes=0, started_at=timestamp,
                                                   ended_at=timestamp + timedelta(seconds=5), created_at=timestamp))
                    db.commit()
                    self.assertEqual(self.main.get_focus_streak(db)["streak_days"], expected)
                db.query(models.FocusSession).delete()
                timestamp = datetime(2026, 10, 11, 12)
                db.add(models.FocusSession(task_id=1, seconds=0, minutes=0, started_at=timestamp,
                                           ended_at=timestamp, created_at=timestamp))
                db.commit()
                self.assertEqual(self.main.get_companion_days(db)["companion_days"], 0)
                self.assertEqual(self.main.get_focus_streak(db)["streak_days"], 0)
        finally:
            self.main.today_local = previous_today
            engine.dispose()

    def test_overnight_stats_use_start_day_not_save_day(self):
        from datetime import date, datetime
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        import models
        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        previous_today = self.main.today_local
        self.main.today_local = lambda: date(2026, 10, 11)
        try:
            with Session(engine) as db:
                # 23:59 Oct 10 to 00:01 Oct 11 China time, saved Oct 11.
                db.add(models.FocusSession(task_id=1, task_name="overnight", seconds=120, minutes=2,
                    started_at=datetime(2026, 10, 10, 15, 59), ended_at=datetime(2026, 10, 10, 16, 1),
                    created_at=datetime(2026, 10, 11, 0, 1)))
                # Started exactly at local midnight; saved days later.
                db.add(models.FocusSession(task_id=1, task_name="midnight", seconds=7, minutes=0,
                    started_at=datetime(2026, 10, 10, 16), ended_at=datetime(2026, 10, 10, 16, 0, 7),
                    created_at=datetime(2026, 10, 13)))
                db.commit()
                total = self.main.get_focus_total(db)
                self.assertEqual(total["total_seconds"], 127)
                self.assertEqual(total["today_seconds"], 7)
                self.assertEqual([s["task_name"] for s in self.main.get_today_focus_sessions(db)], ["midnight"])
                week = self.main.get_focus_week(db)
                self.assertEqual(week[-2]["seconds"], 120)
                self.assertEqual(week[-1]["seconds"], 7)
                self.assertEqual(self.main.get_companion_days(db)["companion_days"], 2)
                self.assertEqual(self.main.get_focus_streak(db)["streak_days"], 2)
        finally:
            self.main.today_local = previous_today
            engine.dispose()


if __name__ == "__main__":
    unittest.main()

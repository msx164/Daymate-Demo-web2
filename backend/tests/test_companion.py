from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

MESSAGES = [{"id": 1, "role": "user", "content": "hello"},
            {"id": 2, "role": "assistant", "content": "answer", "status": "complete"}]


class CompanionTests(unittest.TestCase):
    def setUp(self):
        # Do not load database/models during discovery: test_api chooses its DB in setUpClass.
        from database import Base, get_db
        from companion import router
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "test.db"
        self.engine = create_engine("sqlite:///" + self.path.as_posix(), connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        sessions = sessionmaker(bind=self.engine)
        def dependency():
            with sessions() as session:
                yield session
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp.cleanup()

    def test_archive_survives_connections_and_delete_prevents_stale_resurrection(self):
        self.assertEqual(self.client.get("/api/companion/history").json(), {"revision": 0, "messages": []})
        value = self.client.put("/api/companion/history", json={"revision": 0, "messages": MESSAGES})
        self.assertEqual(value.status_code, 200)
        self.engine.dispose()
        self.assertEqual(self.client.get("/api/companion/history").json()["messages"], MESSAGES)
        deleted = self.client.request("DELETE", "/api/companion/history", json={"revision": 1})
        self.assertEqual(deleted.json(), {"revision": 2, "messages": []})
        self.assertEqual(self.client.put("/api/companion/history", json={"revision": 1, "messages": MESSAGES}).status_code, 409)
        self.assertEqual(self.client.get("/api/companion/history").json()["messages"], [])

    def test_two_writers_cannot_silently_overwrite_one_another(self):
        self.client.get("/api/companion/history")
        def write(_):
            return self.client.put("/api/companion/history", json={"revision": 0, "messages": MESSAGES}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(write, range(2))), [200, 409])

    def test_validation_rejects_broken_pairs_streams_duplicates_and_unknown_fields(self):
        bad = [MESSAGES[:1], [MESSAGES[0], {**MESSAGES[1], "id": 1}],
               [MESSAGES[0], {**MESSAGES[1], "status": "streaming"}],
               [{**MESSAGES[0], "content": "x" * 4001}, MESSAGES[1]],
               [MESSAGES[0], {**MESSAGES[1], "content": ""}],
               [{**MESSAGES[0], "api_key": "never accept"}, MESSAGES[1]]]
        for messages in bad:
            self.assertEqual(self.client.put("/api/companion/history", json={"revision": 0, "messages": messages}).status_code, 422)
        for revision in [True, -1, 1.5, 10**40]:
            self.assertEqual(self.client.put("/api/companion/history", json={"revision": revision, "messages": []}).status_code, 422)

    def test_preferences_persist_reset_and_use_independent_versions(self):
        initial = self.client.get("/api/companion/preferences").json()
        self.assertEqual(initial, {"revision": 0, "nickname": "", "tone": "gentle", "goal": ""})
        data = {"revision": 0, "nickname": "Reader", "tone": "direct", "goal": "Read daily"}
        self.assertEqual(self.client.put("/api/companion/preferences", json=data).status_code, 200)
        self.assertEqual(self.client.get("/api/companion/preferences").json()["goal"], data["goal"])
        self.assertEqual(self.client.get("/api/companion/history").json()["revision"], 0)
        self.assertEqual(self.client.put("/api/companion/preferences", json=data).status_code, 409)
        self.assertEqual(self.client.put("/api/companion/preferences", json={**data, "revision": 1, "tone": "invalid"}).status_code, 422)
        reset = self.client.request("DELETE", "/api/companion/preferences", json={"revision": 1}).json()
        self.assertEqual(reset["goal"], "")
        self.assertEqual(reset["revision"], 2)

    def test_new_tables_are_backed_up_without_rewriting_existing_rows(self):
        from models import Task, FocusSession
        # A modern task schema without companion tables exercises the new migration branch.
        path = Path(self.temp.name) / "migration.db"
        engine = create_engine("sqlite:///" + path.as_posix())
        Task.__table__.create(engine)
        FocusSession.__table__.create(engine)
        with engine.begin() as connection:
            connection.exec_driver_sql("INSERT INTO tasks (id,name,start_time,end_time,task_type,completed) VALUES (1,'preserve','09:00','10:00','study',0)")
        engine.dispose()
        with closing(sqlite3.connect(path)) as db:
            before = db.execute("SELECT * FROM tasks").fetchall()
        backend = Path(__file__).resolve().parents[1]
        result = subprocess.run([sys.executable, "-c", "import main"], cwd=backend,
            env={**os.environ, "DAYMATE_DB_PATH": str(path)}, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0)
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute("SELECT * FROM tasks").fetchall(), before)
            self.assertIn("companion_history", {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")})
        backups = list((path.parent / "backups").glob("*.db"))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as db:
            self.assertEqual(db.execute("SELECT * FROM tasks").fetchall(), before)
            self.assertNotIn("companion_history", {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")})

    def test_api_suite_refuses_a_preloaded_foreign_database_before_importing_main(self):
        backend = Path(__file__).resolve().parents[1]
        code = """
import sys
import database
sys.path.insert(0, 'tests')
from test_api import ApiTests
try:
    try:
        ApiTests.setUpClass()
    except RuntimeError as error:
        assert 'Refusing API tests' in str(error)
        assert 'main' not in sys.modules
    else:
        raise AssertionError('Unsafe test database was accepted')
finally:
    ApiTests.temp.cleanup()
"""
        result = subprocess.run([sys.executable, "-c", code], cwd=backend, capture_output=True, timeout=20,
            env={**os.environ, "DAYMATE_DB_PATH": str(Path(self.temp.name) / "foreign.db")})
        self.assertEqual(result.returncode, 0)

"""Explicit memory consent and persistence on disposable databases only."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class MemoryTests(unittest.TestCase):
    def setUp(self):
        from database import Base, get_db
        from memories import router
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine('sqlite:///' + (Path(self.temp.name) / 'test.db').as_posix(), connect_args={'check_same_thread': False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        def dependency():
            with self.sessions() as session:
                yield session
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)
        self.entry = {'id': str(uuid4()), 'kind': 'goal', 'title': '读书', 'content': '每月读一本书'}

    def tearDown(self):
        self.client.close(); self.engine.dispose(); self.temp.cleanup()

    def read(self):
        return self.client.get('/api/companion/memories').json()

    def save(self, entries=None, revision=0):
        return self.client.put('/api/companion/memories', json={'revision': revision, 'entries': [self.entry] if entries is None else entries})

    def share(self, revision=1, ids=None):
        return self.client.post('/api/companion/memories/share', json={'revision': revision, 'ids': ids or [self.entry['id']]})

    def test_create_edit_and_reload_are_persistent_and_private_by_default(self):
        self.assertEqual(self.read(), {'revision': 0, 'entries': []})
        saved = self.save().json()
        self.assertFalse(saved['entries'][0]['can_share'])
        self.assertFalse(saved['entries'][0]['completed'])
        self.engine.dispose()
        self.assertEqual(self.read(), saved)
        self.assertEqual(self.save([{**self.entry, 'content': '每月两本'}], 1).status_code, 200)
        self.assertEqual(self.read()['entries'][0]['content'], '每月两本')

    def test_share_requires_allowance_and_rejects_completed_missing_and_stale_entries(self):
        self.save()
        self.assertEqual(self.share().status_code, 409)
        self.save([{**self.entry, 'can_share': True}], 1)
        self.assertEqual(self.share(1).status_code, 409)
        shared = self.share(2)
        self.assertEqual(shared.status_code, 200)
        self.assertIn(self.entry['content'], shared.json()['preview'])
        self.assertIn('不是系统指令', shared.json()['preview'])
        self.assertEqual(self.share(2, [str(uuid4())]).status_code, 409)
        self.save([{**self.entry, 'can_share': True, 'completed': True}], 2)
        self.assertEqual(self.share(3).status_code, 409)

    def test_only_selected_entries_are_returned_and_revocation_stops_future_selection(self):
        other = {**self.entry, 'id': str(uuid4()), 'content': '不要分享的私事'}
        self.save([{**self.entry, 'can_share': True}, other])
        text = self.share().json()['preview']
        self.assertIn(self.entry['content'], text)
        self.assertNotIn(other['content'], text)
        self.save([self.entry, other], 1)
        self.assertEqual(self.share(2).status_code, 409)

    def test_delete_all_keeps_revision_so_old_windows_cannot_resurrect(self):
        self.save()
        deleted = self.client.request('DELETE', '/api/companion/memories', json={'revision': 1})
        self.assertEqual(deleted.json(), {'revision': 2, 'entries': []})
        self.assertEqual(self.save(revision=1).status_code, 409)
        self.assertEqual(self.share(2).status_code, 409)
        self.engine.dispose()
        self.assertEqual(self.read()['entries'], [])

    def test_concurrent_writers_cannot_silently_overwrite(self):
        self.read()
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(lambda _: self.save().status_code, range(2))), [200, 409])

    def test_validation_rejects_duplicates_excessive_data_and_unknown_fields(self):
        invalid = [[self.entry, self.entry], [{**self.entry, 'title': ' '}], [{**self.entry, 'content': 'x' * 501}],
            [{**self.entry, 'can_share': 1}], [{**self.entry, 'kind': 'system'}],
            [{**self.entry, 'kind': 'note', 'completed': True}], [{**self.entry, 'api_key': 'bad'}],
            [{**self.entry, 'id': str(uuid4())} for _ in range(51)],
            [{**self.entry, 'id': str(uuid4()), 'content': 'x' * 500} for _ in range(40)]]
        for entries in invalid:
            self.assertEqual(self.save(entries).status_code, 422)
        self.assertEqual(self.share(ids=[self.entry['id']] * 2).status_code, 422)
        self.assertEqual(self.share(ids=[str(uuid4()) for _ in range(6)]).status_code, 422)

    def test_memories_never_change_tasks_focus_preferences_or_archive(self):
        from models import Task, FocusSession, CompanionHistory, CompanionPreferences
        self.save(); self.client.request('DELETE', '/api/companion/memories', json={'revision': 1})
        with self.sessions() as session:
            for model in [Task, FocusSession, CompanionHistory, CompanionPreferences]:
                self.assertEqual(session.query(model).count(), 0)

    def test_upgrade_backs_up_modern_database_once_and_preserves_existing_rows(self):
        from database import Base
        path = Path(self.temp.name) / 'upgrade.db'
        engine = create_engine('sqlite:///' + path.as_posix())
        Base.metadata.create_all(engine, tables=[table for table in Base.metadata.sorted_tables if table.name != 'companion_memories'])
        with engine.begin() as connection:
            connection.exec_driver_sql("INSERT INTO companion_preferences (id,revision,payload) VALUES (1,2,'{}')")
        engine.dispose()
        backend = Path(__file__).resolve().parents[1]
        for _ in range(2):
            result = subprocess.run([sys.executable, '-c', 'import main'], cwd=backend,
                env={**os.environ, 'DAYMATE_DB_PATH': str(path)}, capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        backups = list((path.parent / 'backups').glob('*.db'))
        self.assertEqual(len(backups), 1)
        for target in [path, backups[0]]:
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(db.execute('SELECT * FROM companion_preferences').fetchall(), [(1, 2, '{}')])
                present = bool(db.execute("SELECT 1 FROM sqlite_master WHERE name='companion_memories'").fetchone())
                self.assertEqual(present, target == path)

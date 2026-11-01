"""Exercise habits against a disposable database, without loading main at discovery."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from contextlib import closing
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


class HabitTests(unittest.TestCase):
    def setUp(self):
        from database import Base, get_db
        from habits import router
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine('sqlite:///' + (Path(self.temp.name) / 'habits.db').as_posix(),
                                    connect_args={'check_same_thread': False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        def dependency():
            with self.sessions() as session:
                yield session
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = dependency
        self.client = TestClient(app)
        self.day = date(2026, 10, 19)  # Monday, deterministic China-local date.
        self.clock = patch('habits.today_local', side_effect=lambda: self.day)
        self.clock.start()

    def tearDown(self):
        self.clock.stop()
        self.client.close()
        self.engine.dispose()
        self.temp.cleanup()

    def create(self, key='one', days=None):
        return self.client.post('/api/habits', json={'name': '阅读十分钟',
            'weekdays': days if days is not None else list(range(7)), 'create_key': key})

    def checkin(self, habit_id=1, completed=True, day=None):
        return self.client.put(f'/api/habits/{habit_id}/checkin', json={
            'day': (day or self.day).isoformat(), 'completed': completed})

    def overview(self):
        response = self.client.get('/api/habits/overview')
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_create_retries_do_not_duplicate_or_accept_changed_payload(self):
        self.assertEqual(self.create().status_code, 200)
        self.assertEqual(self.create().json()['id'], 1)
        self.assertEqual(self.create(days=[1]).status_code, 409)
        self.assertEqual(len(self.overview()['habits']), 1)
        for days in [[], [0, 0], [7], [-1], [True], ['0'], [0.5]]:
            self.assertEqual(self.create('invalid', days).status_code, 422)
        self.assertEqual(self.client.post('/api/habits', json={
            'name': ' ', 'weekdays': [0], 'create_key': 'blank'}).status_code, 422)

    def test_schedule_and_history_have_no_precreation_or_future_opportunities(self):
        self.create(days=[0, 2, 4])
        initial = self.overview()
        self.assertTrue(initial['habits'][0]['due_today'])
        self.assertEqual(sum(row['planned'] for row in initial['days']), 1)
        self.day += timedelta(days=1)
        self.assertFalse(self.overview()['habits'][0]['due_today'])
        self.assertEqual(self.checkin().status_code, 409)
        self.day += timedelta(days=1)
        self.assertEqual(self.checkin().status_code, 200)
        days = self.overview()['days']
        self.assertEqual(sum(row['planned'] for row in days), 2)
        self.assertEqual(sum(row['completed'] for row in days), 1)

    def test_concurrent_checkin_and_undo_are_idempotent_and_persist(self):
        self.create()
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(lambda _: self.checkin().status_code, range(2))), [200, 200])
        self.engine.dispose()
        self.assertEqual(self.overview()['days'][-1]['completed'], 1)
        self.assertEqual(self.checkin(completed=False).status_code, 200)
        self.assertEqual(self.checkin(completed=False).status_code, 200)
        self.assertEqual(self.overview()['days'][-1]['completed'], 0)

    def test_reject_other_days_unknown_habits_and_non_boolean_completion(self):
        self.create()
        for offset in [-1, 1]:
            self.assertEqual(self.checkin(day=self.day + timedelta(days=offset)).status_code, 409)
        self.assertEqual(self.checkin(99).status_code, 404)
        self.assertEqual(self.client.put('/api/habits/1/checkin', json={
            'day': str(self.day), 'completed': 1}).status_code, 422)

    def test_archive_preserves_today_and_history_but_stops_future_plan(self):
        self.create()
        self.checkin()
        for _ in range(2):
            self.assertEqual(self.client.put('/api/habits/1/archive').status_code, 200)
        self.assertTrue(self.overview()['habits'][0]['due_today'])
        self.day += timedelta(days=1)
        self.assertEqual(self.checkin().status_code, 409)
        data = self.overview()
        self.assertEqual(data['habits'], [])
        self.assertEqual(sum(day['planned'] for day in data['days']), 1)
        self.assertEqual(sum(day['completed'] for day in data['days']), 1)

    def test_reflection_persists_and_rollover_rejects_old_week_writes(self):
        value = {'week_start': str(self.day), 'note': ' 本周保持阅读，下周早点开始。 ', 'revision': 0}
        self.assertEqual(self.client.put('/api/habits/reflection', json=value).status_code, 200)
        self.engine.dispose()
        self.assertEqual(self.overview()['reflection'], value['note'].strip())
        self.assertEqual(self.client.put('/api/habits/reflection', json=value).status_code, 409)
        self.assertEqual(self.client.put('/api/habits/reflection', json={**value, 'revision': 1}).status_code, 200)
        self.day += timedelta(days=7)
        self.assertEqual(self.client.put('/api/habits/reflection', json=value).status_code, 409)
        data = self.overview()
        self.assertEqual(data['reflection'], '')
        self.assertEqual(data['past_reflections'][0]['note'], value['note'].strip())

    def test_checkins_do_not_create_task_or_focus_records(self):
        from models import Task, FocusSession
        self.create()
        self.checkin()
        with self.sessions() as session:
            self.assertEqual(session.query(Task).count(), 0)
            self.assertEqual(session.query(FocusSession).count(), 0)

    def test_habit_upgrade_backs_up_modern_database_and_preserves_business_rows(self):
        from models import Task, FocusSession, CompanionHistory, CompanionPreferences
        path = Path(self.temp.name) / 'upgrade.db'
        engine = create_engine('sqlite:///' + path.as_posix())
        for model in [Task, FocusSession, CompanionHistory, CompanionPreferences]:
            model.__table__.create(engine)
        with engine.begin() as connection:
            connection.exec_driver_sql("INSERT INTO tasks (id,name,start_time,end_time,task_type,completed) VALUES (1,'keep','09:00','10:00','study',0)")
            connection.exec_driver_sql("INSERT INTO focus_sessions (id,task_id,minutes,seconds,started_at,ended_at,completes_task) VALUES (1,1,0,5,'2026-10-19 01:00:00','2026-10-19 01:00:05',0)")
        engine.dispose()
        with closing(sqlite3.connect(path)) as connection:
            before = {table: connection.execute(f'SELECT * FROM {table}').fetchall() for table in ['tasks', 'focus_sessions']}
        backend = Path(__file__).resolve().parents[1]
        for _ in range(2):
            result = subprocess.run([sys.executable, '-c', 'import main'], cwd=backend,
                env={**os.environ, 'DAYMATE_DB_PATH': str(path)}, capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        backups = list((path.parent / 'backups').glob('*.db'))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as connection:
            self.assertNotIn('habits', {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")})
            for table, rows in before.items():
                self.assertEqual(connection.execute(f'SELECT * FROM {table}').fetchall(), rows)
        with closing(sqlite3.connect(path)) as connection:
            self.assertTrue({'habits', 'habit_checkins', 'weekly_reflections'}.issubset(
                {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}))
            for table, rows in before.items():
                self.assertEqual(connection.execute(f'SELECT * FROM {table}').fetchall(), rows)

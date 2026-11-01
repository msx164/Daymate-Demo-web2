import csv
import io
import sys
import unittest
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class HistoryTests(unittest.TestCase):
    def setUp(self):
        from database import Base, get_db
        from focus_history import router
        from models import FocusSession
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        app = FastAPI()
        app.include_router(router)
        def database():
            with Session(self.engine) as db:
                yield db
        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        with Session(self.engine) as db:
            for index, (stamp, seconds) in enumerate([('2026-10-16T15:59:59', 17), ('2026-10-16T16:00:00', 61), ('2026-10-17T15:59:59', 123), ('2026-10-17T16:00:00', 30)], 1):
                started = datetime.fromisoformat(stamp)
                db.add(FocusSession(id=index, task_id=99, task_name='=SUM(1,2)' if index == 2 else '历史任务',
                    seconds=seconds, minutes=seconds // 60, started_at=started, ended_at=started))
            db.commit()

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_china_start_day_boundaries_and_page_independent_seconds(self):
        query = '/api/focus-history?start_date=2026-10-17&end_date=2026-10-17&limit=1'
        first = self.client.get(query).json()
        second = self.client.get(query + '&offset=1').json()
        self.assertEqual(first['count'], 2)
        self.assertEqual(first['total_seconds'], 184)
        self.assertEqual(first['items'][0]['id'], 3)
        self.assertEqual(second['items'][0]['id'], 2)
        self.assertEqual(second['total_seconds'], 184)
        self.assertEqual(datetime.fromisoformat(first['items'][0]['started_at'].replace('Z', '+00:00')).utcoffset().total_seconds(), 0)

    def test_invalid_ranges_and_pagination_rejected(self):
        for query in ['start_date=2026-10-18&end_date=2026-10-17', 'start_date=2025-01-01&end_date=2026-10-17',
                      'start_date=bad&end_date=2026-10-17', 'start_date=2026-10-17&end_date=2026-10-17&limit=101',
                      'start_date=2026-10-17&end_date=2026-10-17&offset=-1']:
            self.assertEqual(self.client.get('/api/focus-history?' + query).status_code, 422)

    def test_empty_range_is_explicit(self):
        result = self.client.get('/api/focus-history?start_date=2026-01-01&end_date=2026-01-02').json()
        self.assertEqual(result['items'], [])
        self.assertEqual(result['total_seconds'], 0)
        self.assertEqual(result['count'], 0)

    def test_stats_use_whole_range_not_current_page(self):
        result = self.client.get('/api/focus-history?start_date=2026-10-16&end_date=2026-10-18&limit=1').json()
        self.assertEqual(result['count'], 4)
        self.assertEqual(result['total_seconds'], 231)
        self.assertEqual(result['active_days'], 3)
        self.assertEqual(result['average_active_day_seconds'], 77)

    def test_csv_exports_all_pages_quotes_formulas_and_preserves_seconds(self):
        response = self.client.get('/api/focus-history/csv?start_date=2026-10-17&end_date=2026-10-17')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'\xef\xbb\xbf'))
        rows = list(csv.reader(io.StringIO(response.content.decode('utf-8-sig'))))
        self.assertEqual(len(rows), 3)
        self.assertEqual(sum(int(row[5]) for row in rows[1:]), 184)
        self.assertEqual(rows[2][1], "'=SUM(1,2)")

    def test_csv_empty_range_has_header_and_bounded_export_rejects_truncation(self):
        response = self.client.get('/api/focus-history/csv?start_date=2026-01-01&end_date=2026-01-02')
        self.assertEqual(len(list(csv.reader(io.StringIO(response.content.decode('utf-8-sig'))))), 1)
        from models import FocusSession
        with Session(self.engine) as db:
            db.bulk_insert_mappings(FocusSession, [dict(task_id=99, task_name='bulk', seconds=1, minutes=0,
                started_at=datetime(2026, 10, 17), ended_at=datetime(2026, 10, 17)) for _ in range(5000)])
            db.commit()
        self.assertEqual(self.client.get('/api/focus-history/csv?start_date=2026-10-17&end_date=2026-10-17').status_code, 413)

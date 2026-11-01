import os
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from import_database import import_database, inspect_database
import chat


class DatabaseImportTests(unittest.TestCase):
    def test_snapshot_keeps_data_and_source_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            source, destination = Path(directory) / "source.db", Path(directory) / "destination.db"
            with closing(sqlite3.connect(source)) as connection:
                connection.executescript("""
                    CREATE TABLE tasks(id INTEGER PRIMARY KEY, name TEXT, start_time TEXT, end_time TEXT, task_type TEXT, completed BOOLEAN);
                    CREATE TABLE focus_sessions(id INTEGER PRIMARY KEY, task_id INTEGER, minutes INTEGER, seconds INTEGER, started_at TEXT, ended_at TEXT, created_at TEXT);
                    INSERT INTO tasks VALUES(1, 'reading', '09:00', '10:00', 'study', 0);
                    INSERT INTO focus_sessions VALUES(1, 1, 0, 25, '2026-10-13T09:00', '2026-10-13T09:00:25', '2026-10-13T09:00:25');
                """)
                connection.commit()
            before = source.read_bytes()
            self.assertEqual(inspect_database(source), {"tasks": 1, "focus_sessions": 1})
            self.assertEqual(import_database(source, destination), {"tasks": 1, "focus_sessions": 1})
            self.assertEqual(source.read_bytes(), before)
            with closing(sqlite3.connect(destination)) as connection:
                self.assertEqual(connection.execute("SELECT seconds FROM focus_sessions").fetchone()[0], 25)
            copied = destination.read_bytes()
            with self.assertRaises(ValueError):
                import_database(source, destination)
            self.assertEqual(destination.read_bytes(), copied)
            with self.assertRaises(ValueError):
                import_database(source, source)

    def test_inspection_rejects_non_sqlite_and_views_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'invalid.db'
            source.write_bytes(b'not sqlite')
            with self.assertRaises(ValueError):
                inspect_database(source)
            with closing(sqlite3.connect(Path(directory) / 'views.db')) as db:
                db.execute('CREATE VIEW tasks AS SELECT 1 AS id')
                db.commit()
            with self.assertRaises(ValueError):
                inspect_database(Path(directory) / 'views.db')

    def test_online_wal_backup_preserves_committed_records_and_history(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'active.db', Path(directory) / 'backup.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.executescript('''CREATE TABLE tasks(id INTEGER, name TEXT, start_time TEXT, end_time TEXT, task_type TEXT, completed INTEGER);
                    CREATE TABLE focus_sessions(id INTEGER, task_id INTEGER, minutes INTEGER, seconds INTEGER, started_at TEXT, ended_at TEXT, created_at TEXT);
                    CREATE TABLE companion_history(id INTEGER,payload TEXT);
                    INSERT INTO tasks VALUES(1,'active','09:00','10:00','study',0);
                    INSERT INTO companion_history VALUES(1,'saved archive');''')
                db.commit()
                self.assertEqual(import_database(source, target)['tasks'], 1)
                with closing(sqlite3.connect(target)) as copied:
                    self.assertEqual(copied.execute('SELECT payload FROM companion_history').fetchone()[0], 'saved archive')

    def test_invalid_database_does_not_leave_destination_or_temporary_files(self):
        with tempfile.TemporaryDirectory() as directory:
            source, destination = Path(directory) / "other.db", Path(directory) / "copy.db"
            with closing(sqlite3.connect(source)) as connection:
                connection.execute("CREATE TABLE other(value TEXT)")
                connection.commit()
            with self.assertRaises(ValueError):
                import_database(source, destination)
            self.assertFalse(destination.exists())
            self.assertEqual(list(Path(directory).glob("daymate-import-*.db")), [])
            source.write_text("not sqlite")
            with self.assertRaises(sqlite3.DatabaseError):
                import_database(source, destination)
            self.assertFalse(destination.exists())

    def test_installed_config_reloads_from_explicit_path_and_keeps_key_private(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "backend.env"
            config.write_text("DAYMATE_AI_PROVIDER=compatible\nDAYMATE_AI_BASE_URL=https://example.test/v1\nDAYMATE_AI_API_KEY=private-test-key\nDAYMATE_AI_MODEL=test-model\n")
            with patch.dict(os.environ, {"DAYMATE_CONFIG_PATH": str(config)}, clear=True):
                result = chat.get_config()
                self.assertTrue(result.ready)
                self.assertNotIn("private-test-key", repr(result))
                config.write_text("DAYMATE_AI_API_KEY=\n")
                self.assertFalse(chat.get_config().ready)

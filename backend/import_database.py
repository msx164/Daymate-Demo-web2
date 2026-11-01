"""Copy a validated SQLite snapshot; never move the source or replace user data."""
from contextlib import closing
from pathlib import Path
import os
import sqlite3
import tempfile
import time

REQUIRED = {"tasks": {"id", "name", "start_time", "end_time", "task_type", "completed"},
            "focus_sessions": {"id", "task_id", "minutes", "seconds", "started_at", "ended_at", "created_at"}}


def validate_connection(connection):
    connection.execute('PRAGMA trusted_schema=OFF')
    if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise ValueError("Database integrity check failed")
    tables = dict(connection.execute("SELECT name,type FROM sqlite_master WHERE type IN ('table','view')"))
    for table, columns in REQUIRED.items():
        if tables.get(table) != 'table':
            raise ValueError("Not a supported Daymate database")
        actual = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
        if not columns.issubset(actual):
            raise ValueError("Not a supported Daymate database")
    return {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in REQUIRED}


def inspect_database(source_path):
    source = Path(source_path).resolve()
    if not source.is_file() or source.stat().st_size > 256 * 1024 * 1024:
        raise ValueError('Source missing or exceeds snapshot budget')
    with source.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            raise ValueError('Not a SQLite database')
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=10)) as connection:
        return validate_connection(connection)


def import_database(source_path, destination_path):
    source_path, destination = Path(source_path).resolve(), Path(destination_path).resolve()
    if not source_path.is_file() or destination.exists():
        raise ValueError("Source missing or destination already exists")
    if source_path.stat().st_size > 256 * 1024 * 1024:
        raise ValueError('Source exceeds snapshot budget')
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="daymate-import-", suffix=".db", dir=destination.parent)
    os.close(descriptor)
    temporary = Path(temporary)
    try:
        with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True, timeout=10)) as source:
            with closing(sqlite3.connect(temporary)) as target:
                deadline = time.monotonic() + 10
                def progress(status, remaining, total):
                    if time.monotonic() > deadline:
                        raise TimeoutError('Snapshot timed out')
                source.backup(target, pages=256, progress=progress, sleep=0.05)
                counts = validate_connection(target)
        # Windows rename refuses an existing destination, including one created after validation.
        if os.name == "nt":
            temporary.rename(destination)
        else:
            os.link(temporary, destination)
        return counts
    finally:
        temporary.unlink(missing_ok=True)

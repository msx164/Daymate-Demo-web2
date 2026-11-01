import os
from pathlib import Path
import sqlite3
from contextlib import closing
from datetime import datetime

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import declarative_base, sessionmaker
from time_utils import today_local


DB_PATH = Path(os.environ.get("DAYMATE_DB_PATH", Path(__file__).with_name("daymate.db"))).resolve()
DATABASE_URL = "sqlite:///" + DB_PATH.as_posix()


engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False
    }
)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


Base = declarative_base()


def initialize_database():
    """Back up and incrementally extend legacy schemas without replacing tables."""
    additions = {
        "tasks": {"task_date": "DATE", "deleted_at": "DATETIME", "create_key": "VARCHAR", "create_payload": "VARCHAR"},
        "focus_sessions": {
            "session_key": "VARCHAR", "completes_task": "BOOLEAN NOT NULL DEFAULT 0",
            "task_name": "VARCHAR", "planned_seconds": "INTEGER",
        },
    }
    if DB_PATH.exists():
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        missing = {table: {name: sql_type for name, sql_type in fields.items()
                           if name not in {column["name"] for column in inspector.get_columns(table)}}
                   for table, fields in additions.items() if table in tables}
        if any(missing.values()) or any(table not in tables for table in (
            "companion_history", "companion_preferences", "habits", "habit_checkins", "weekly_reflections", "companion_memories",
        )):
            backup_dir = DB_PATH.parent / "backups"
            backup_dir.mkdir(exist_ok=True)
            backup_path = backup_dir / f"daymate-before-history-{datetime.now():%Y%m%d-%H%M%S-%f}.db"
            with closing(sqlite3.connect(DB_PATH.as_uri() + "?mode=ro", uri=True)) as source:
                with closing(sqlite3.connect(backup_path)) as target:
                    source.backup(target)
            with engine.begin() as connection:
                connection.exec_driver_sql("BEGIN IMMEDIATE")
                for table, fields in missing.items():
                    # Recheck after taking the write lock (another process may have migrated).
                    columns = {row[1] for row in connection.exec_driver_sql(f"PRAGMA table_info({table})")}
                    for name, sql_type in fields.items():
                        if name in columns:
                            continue
                        connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")
                        if table == "tasks" and name == "task_date":
                            # Legacy tasks have no recoverable date; keep them visible today.
                            connection.exec_driver_sql("UPDATE tasks SET task_date=?", (str(today_local()),))
                        if table == "focus_sessions" and name == "task_name":
                            connection.exec_driver_sql("""UPDATE focus_sessions SET task_name=COALESCE(
                                (SELECT name FROM tasks WHERE tasks.id=focus_sessions.task_id), '已删除任务')""")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_focus_session_key ON focus_sessions(session_key)")
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_task_create_key ON tasks(create_key)")



def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, UniqueConstraint
from time_utils import now_local, today_local
from database import Base


class Habit(Base):
    __tablename__ = "habits"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    weekdays = Column(String, nullable=False)
    created_on = Column(Date, nullable=False, default=today_local)
    archived_on = Column(Date, nullable=True)
    create_key = Column(String, nullable=False, unique=True)
    create_payload = Column(String, nullable=False)


class HabitCheckin(Base):
    __tablename__ = "habit_checkins"
    __table_args__ = (UniqueConstraint("habit_id", "day"),)
    id = Column(Integer, primary_key=True)
    habit_id = Column(Integer, nullable=False, index=True)
    day = Column(Date, nullable=False)


class WeeklyReflection(Base):
    __tablename__ = "weekly_reflections"
    week_start = Column(Date, primary_key=True)
    note = Column(String, nullable=False)
    revision = Column(Integer, nullable=False, default=0)

class CompanionMemories(Base):
    __tablename__ = "companion_memories"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    payload = Column(String, nullable=False, default="[]")


class CompanionHistory(Base):
    __tablename__ = "companion_history"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    payload = Column(String, nullable=False, default="[]")

class CompanionPreferences(Base):
    __tablename__ = "companion_preferences"
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    payload = Column(String, nullable=False, default="{}")

class Task(Base):
    __tablename__ = "tasks"
    task_date = Column(Date, nullable=True, default=today_local)
    deleted_at = Column(DateTime, nullable=True)
    create_key = Column(String, nullable=True)
    create_payload = Column(String, nullable=True)

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String,
        nullable=False
    )

    start_time = Column(
        String,
        nullable=False
    )

    end_time = Column(
        String,
        nullable=False
    )

    task_type = Column(
        String,
        nullable=False
    )

    completed = Column(
        Boolean,
        default=False
    )

class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, nullable=False)
    session_key = Column(String, nullable=True)
    completes_task = Column(Boolean, nullable=False, default=False)
    task_name = Column(String, nullable=True)
    planned_seconds = Column(Integer, nullable=True)

    minutes = Column(Integer, nullable=False)
    seconds = Column(Integer, nullable=False)

    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)

    created_at = Column(
        DateTime,
        default=now_local
    )

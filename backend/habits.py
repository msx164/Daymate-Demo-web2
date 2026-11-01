"""Local recurring habits. Check-ins never alter tasks or focus records."""
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy import update
from sqlalchemy.orm import Session

from database import get_db
from models import Habit, HabitCheckin, WeeklyReflection
from time_utils import today_local

router = APIRouter(prefix="/api/habits", tags=["习惯与复盘"])


class HabitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    create_key: str = Field(min_length=1, max_length=100)

    @field_validator("weekdays", mode="before")
    @classmethod
    def valid_days(cls, value):
        if not isinstance(value, list) or not value or any(type(day) is not int or day not in range(7) for day in value):
            raise ValueError("请选择有效的星期（周一为 0，周日为 6）")
        if len(value) != len(set(value)):
            raise ValueError("星期不可重复")
        return sorted(value)


class CheckinUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    day: date
    completed: bool = Field(strict=True)


class ReflectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    week_start: date
    note: str = Field(max_length=2000)
    revision: int = Field(ge=0, le=2**53 - 2, strict=True)


def due(habit, day):
    return (habit.created_on <= day and (habit.archived_on is None or day <= habit.archived_on)
            and day.weekday() in json.loads(habit.weekdays))


def habit_response(habit):
    return {"id": habit.id, "name": habit.name, "weekdays": json.loads(habit.weekdays),
            "created_on": habit.created_on, "archived_on": habit.archived_on}


def require_today(day):
    if day != today_local():
        raise HTTPException(409, "日期已变化，请刷新后操作；本阶段仅支持今日打卡")


@router.post("")
def create_habit(value: HabitCreate, db: Session = Depends(get_db)):
    payload = json.dumps({"name": value.name, "weekdays": value.weekdays}, ensure_ascii=False, sort_keys=True)
    db.execute(insert(Habit).values(name=value.name, weekdays=json.dumps(value.weekdays),
        created_on=today_local(), create_key=value.create_key, create_payload=payload)
        .on_conflict_do_nothing(index_elements=["create_key"]))
    habit = db.query(Habit).filter_by(create_key=value.create_key).one()
    if habit.create_payload != payload:
        db.rollback()
        raise HTTPException(409, "创建请求编号已用于另一项习惯")
    db.commit()
    return habit_response(habit)


@router.put("/{habit_id}/checkin")
def checkin(habit_id: int, value: CheckinUpdate, db: Session = Depends(get_db)):
    # Serialize against archive as well as concurrent check-ins; state writes are idempotent.
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    require_today(value.day)
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(404, "习惯不存在")
    if not due(habit, value.day):
        raise HTTPException(409, "这项习惯今日没有安排")
    if value.completed:
        db.execute(insert(HabitCheckin).values(habit_id=habit_id, day=value.day)
                   .on_conflict_do_nothing(index_elements=["habit_id", "day"]))
    else:
        db.query(HabitCheckin).filter_by(habit_id=habit_id, day=value.day).delete()
    db.commit()
    return {"habit_id": habit_id, "day": value.day, "completed": value.completed}


@router.put("/{habit_id}/archive")
def archive(habit_id: int, db: Session = Depends(get_db)):
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    habit = db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(404, "习惯不存在")
    # Keep today's plan and all historical denominators unchanged.
    if habit.archived_on is None:
        habit.archived_on = today_local()
    db.commit()
    return habit_response(habit)


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    today = today_local()
    start = today - timedelta(days=6)
    monday = today - timedelta(days=today.weekday())
    habits = db.query(Habit).order_by(Habit.id).all()
    checked = {(row.habit_id, row.day) for row in db.query(HabitCheckin)
               .filter(HabitCheckin.day >= start, HabitCheckin.day <= today).all()}
    days = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        planned = [habit for habit in habits if due(habit, day)]
        days.append({"day": day, "planned": len(planned),
                     "completed": sum((habit.id, day) in checked for habit in planned)})
    reflection = db.get(WeeklyReflection, monday)
    return {"today": today, "week_start": monday,
            "habits": [habit_response(habit) | {"due_today": due(habit, today),
                       "completed_today": (habit.id, today) in checked}
                       for habit in habits if habit.archived_on is None or habit.archived_on >= today],
            "days": days, "reflection": reflection.note if reflection else "",
            "reflection_revision": reflection.revision if reflection else 0,
            "past_reflections": [{"week_start": row.week_start, "note": row.note}
                for row in db.query(WeeklyReflection).filter(WeeklyReflection.week_start < monday)
                .order_by(WeeklyReflection.week_start.desc()).limit(8).all()]}


@router.put("/reflection")
def save_reflection(value: ReflectionUpdate, db: Session = Depends(get_db)):
    today = today_local()
    if value.week_start != today - timedelta(days=today.weekday()):
        raise HTTPException(409, "已进入新的一周，请刷新后保存复盘")
    if value.revision == 0:
        result = db.execute(insert(WeeklyReflection).values(week_start=value.week_start, note=value.note, revision=1)
                            .on_conflict_do_nothing(index_elements=["week_start"]))
    else:
        result = db.execute(update(WeeklyReflection).where(WeeklyReflection.week_start == value.week_start,
            WeeklyReflection.revision == value.revision).values(note=value.note, revision=value.revision + 1))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "复盘已在其他窗口保存，请先复制当前草稿，再重新读取后修改")
    db.commit()
    return {"week_start": value.week_start, "note": value.note, "revision": value.revision + 1}

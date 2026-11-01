from fastapi import FastAPI, Depends, HTTPException, Header
import json
import os
from desktop_security import DesktopTokenMiddleware, allowed_origins
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta, timezone
from time_utils import today_local, now_local, focus_date

import models
from chat import router as chat_router
from task_drafts import router as draft_router
from companion import router as companion_router
from focus_history import router as focus_history_router, session_response
from habits import router as habits_router
from memories import router as memories_router

from database import get_db, initialize_database

# 创建数据库表
initialize_database()

def utc_naive(value):
    # Existing started_at/ended_at values were sent as UTC and stored without tzinfo.
    return value if value.tzinfo is None else value.astimezone(timezone.utc).replace(tzinfo=None)


app = FastAPI(
    title="Daymate API",
    description="AI陪伴式自律辅助系统后端"
)
app.include_router(chat_router)
app.include_router(draft_router)
app.include_router(companion_router)
app.include_router(focus_history_router)
app.include_router(habits_router)
app.include_router(memories_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DesktopTokenMiddleware, token=os.environ.get("DAYMATE_DESKTOP_TOKEN", ""))

# =========================
# 数据格式
# =========================

class TaskCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    task_type: str = Field(min_length=1, max_length=50)
    task_date: date = Field(default_factory=today_local)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    start_time: str
    end_time: str
    task_type: str
    completed: bool
    task_date: date | None

class TaskUpdate(BaseModel):
    completed: bool = Field(strict=True)

class FocusSessionCreate(BaseModel):
    task_id: int = Field(gt=0, strict=True)
    seconds: int = Field(gt=0, strict=True)
    started_at: datetime
    ended_at: datetime
    session_key: str | None = Field(default=None, min_length=1, max_length=100)
    complete_task: bool = Field(default=False, strict=True)
    planned_seconds: int | None = Field(default=None, ge=60, le=240 * 60, strict=True)

    @field_validator("started_at", "ended_at")
    @classmethod
    def normalize_timestamp(cls, value):
        return utc_naive(value)

    @model_validator(mode="after")
    def validate_duration(self):
        duration = (self.ended_at - self.started_at).total_seconds()
        if duration < 0:
            raise ValueError("结束时间不能早于开始时间")
        if self.seconds > duration + 1:
            raise ValueError("专注时长不能超过起止时间跨度")
        if self.planned_seconds is not None and self.seconds > self.planned_seconds:
            raise ValueError("实际专注时长不能超过设定时长")
        return self
# =========================
# 基础接口
# =========================

@app.get("/")
def root():
    return {
        "message": "Daymate Backend is running!"
    }


@app.get("/api/hello")
def hello():
    return {
        "message": "Hello from Daymate API!"
    }


# =========================
# 获取任务
# =========================

@app.get(
    "/api/tasks",
    response_model=list[TaskResponse]
)
def get_tasks(
    task_date: date | None = None,
    deleted: bool = False,
    db: Session = Depends(get_db)
):

    query = db.query(models.Task).filter(models.Task.deleted_at.is_not(None) if deleted else models.Task.deleted_at.is_(None))
    if task_date is not None:
        query = query.filter(models.Task.task_date == task_date)
    tasks = query.order_by(models.Task.id).all()

    return tasks


# =========================
# 创建任务
# =========================

@app.post(
    "/api/tasks",
    response_model=TaskResponse
)
def create_task(
    task: TaskCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=1, max_length=100),
    db: Session = Depends(get_db)
):

    payload = json.dumps(task.model_dump(mode="json"), ensure_ascii=False, sort_keys=True)
    def retry_response(existing):
        if existing.create_payload != payload:
            raise HTTPException(status_code=409, detail="创建编号已用于不同任务内容")
        if existing.deleted_at is not None:
            raise HTTPException(status_code=410, detail="该创建请求的任务已删除，请在已删除任务中恢复")
        return existing
    if idempotency_key:
        existing = db.query(models.Task).filter_by(create_key=idempotency_key).first()
        if existing:
            return retry_response(existing)
    new_task = models.Task(
        name=task.name,
        start_time=task.start_time,
        end_time=task.end_time,
        task_type=task.task_type,
        task_date=task.task_date,
        completed=False,
        create_key=idempotency_key,
        create_payload=payload if idempotency_key else None,
    )

    db.add(new_task)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.Task).filter_by(create_key=idempotency_key).first() if idempotency_key else None
        if existing:
            return retry_response(existing)
        raise

    db.refresh(new_task)

    return new_task


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
def edit_task(task_id: int, update: TaskCreate, db: Session = Depends(get_db)):
    task = db.get(models.Task, task_id)
    if task is None or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    # Preserve existing focus name snapshots before renaming a legacy task.
    db.query(models.FocusSession).filter(models.FocusSession.task_id == task_id,
        models.FocusSession.task_name.is_(None)).update({"task_name": task.name}, synchronize_session=False)
    for field, value in update.model_dump().items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@app.post("/api/tasks/{task_id}/restore", response_model=TaskResponse)
def restore_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(models.Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task.deleted_at = None
    db.commit()
    db.refresh(task)
    return task


# =========================
# 完成 / 取消完成任务
# =========================

@app.put(
    "/api/tasks/{task_id}",
    response_model=TaskResponse
)
def toggle_task(
    task_id: int,
    update: TaskUpdate | None = None,
    db: Session = Depends(get_db)
):

    task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if task is None or task.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    task.completed = update.completed if update else not task.completed

    db.commit()

    db.refresh(task)

    return task


# =========================
# 删除任务
# =========================

@app.delete(
    "/api/tasks/{task_id}"
)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db)
):

    task = db.query(
        models.Task
    ).filter(
        models.Task.id == task_id
    ).first()

    if task is None or task.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    # Keep IDs and historical references; fill any legacy snapshot before hiding the task.
    db.query(models.FocusSession).filter(
        models.FocusSession.task_id == task_id, models.FocusSession.task_name.is_(None)
    ).update({"task_name": task.name}, synchronize_session=False)
    task.deleted_at = now_local()

    db.commit()

    return {
        "message": "Task deleted successfully"
    }

@app.post("/api/focus-sessions")
def create_focus_session(
    session: FocusSessionCreate,
    db: Session = Depends(get_db)
):
    def existing_response(existing):
        if (existing.task_id != session.task_id or existing.seconds != session.seconds
                or existing.started_at != session.started_at or existing.ended_at != session.ended_at
                or existing.completes_task != session.complete_task
                or existing.planned_seconds != session.planned_seconds):
            raise HTTPException(status_code=409, detail="提交编号已用于另一条专注记录")
        return session_response(existing)

    if session.session_key:
        existing = db.query(models.FocusSession).filter_by(session_key=session.session_key).first()
        if existing:
            return existing_response(existing)

    task = db.get(models.Task, session.task_id)
    if task is None or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")

    new_session = models.FocusSession(
        task_id=session.task_id,
        session_key=session.session_key,
        completes_task=session.complete_task,
        task_name=task.name,
        planned_seconds=session.planned_seconds,
        seconds=session.seconds,
        minutes=session.seconds // 60,
        started_at=session.started_at,
        ended_at=session.ended_at
    )

    db.add(new_session)
    if session.complete_task:
        task.completed = True
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.FocusSession).filter_by(session_key=session.session_key).first() if session.session_key else None
        if existing:
            return existing_response(existing)
        raise
    db.refresh(new_session)

    return session_response(new_session)


@app.get("/api/focus-total")
def get_focus_total(db: Session = Depends(get_db)):
    sessions = db.query(models.FocusSession).all()
    total_seconds = sum(session.seconds for session in sessions)
    today = today_local()
    today_seconds = sum(session.seconds for session in sessions if focus_date(session) == today)
    return {
        "total_seconds": total_seconds, "total_minutes": total_seconds // 60,
        "today_seconds": today_seconds, "today_date": str(today),
    }


@app.get("/api/focus-sessions/today")
def get_today_focus_sessions(db: Session = Depends(get_db)):
    today = today_local()
    sessions = db.query(models.FocusSession).order_by(models.FocusSession.started_at.desc()).all()
    return [session_response(session) for session in sessions if focus_date(session) == today]


@app.get("/api/focus-week")
def get_focus_week(db: Session = Depends(get_db)):
    today = today_local()
    totals = {}
    for session in db.query(models.FocusSession).all():
        day = focus_date(session)
        totals[day] = totals.get(day, 0) + session.seconds
    result = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        seconds = totals.get(day, 0)
        result.append({"date": str(day), "seconds": seconds, "minutes": seconds // 60})
    return result


def active_focus_dates(db):
    today = today_local()
    return {focus_date(session) for session in db.query(models.FocusSession).all()
            if session.seconds > 0 and focus_date(session) <= today}


@app.get("/api/companion-days")
def get_companion_days(db: Session = Depends(get_db)):
    return {"companion_days": len(active_focus_dates(db))}


@app.get("/api/focus-streak")
def get_focus_streak(db: Session = Depends(get_db)):
    active_dates = active_focus_dates(db)
    current = today_local()
    if current not in active_dates:
        current -= timedelta(days=1)
    streak = 0
    while current in active_dates:
        streak += 1
        current -= timedelta(days=1)
    return {"streak_days": streak}

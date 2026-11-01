"""Read-only historical focus queries. Existing rows and start-day attribution are preserved."""
from datetime import date, datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi.responses import Response
import csv
import io
import models
from database import get_db

router = APIRouter(prefix="/api/focus-history", tags=["专注历史"])


def session_response(session):
    return {
        "id": session.id, "task_id": session.task_id,
        "seconds": session.seconds, "minutes": session.minutes,
        "started_at": session.started_at.replace(tzinfo=timezone.utc),
        "ended_at": session.ended_at.replace(tzinfo=timezone.utc),
        "session_key": session.session_key,
        "task_name": session.task_name or "已删除任务",
        "planned_seconds": session.planned_seconds,
    }


def range_query(db, start_date, end_date):
    if end_date < start_date or (end_date - start_date).days >= 366:
        raise HTTPException(422, "日期区间需按先后顺序，且最多覆盖 366 天")
    if end_date == date.max or start_date == date.min:
        raise HTTPException(422, "日期超出支持范围")
    start = datetime.combine(start_date, time.min) - timedelta(hours=8)
    end = datetime.combine(end_date + timedelta(days=1), time.min) - timedelta(hours=8)
    return db.query(models.FocusSession).filter(models.FocusSession.started_at >= start,
                                               models.FocusSession.started_at < end)


@router.get("")
def history(start_date: date, end_date: date, limit: int = Query(25, ge=1, le=100),
            offset: int = Query(0, ge=0, le=1000000), db: Session = Depends(get_db)):
    query = range_query(db, start_date, end_date)
    count, seconds = query.with_entities(func.count(models.FocusSession.id),
                                        func.coalesce(func.sum(models.FocusSession.seconds), 0)).one()
    rows = query.order_by(models.FocusSession.started_at.desc(), models.FocusSession.id.desc()).offset(offset).limit(limit).all()
    days = query.with_entities(func.date(models.FocusSession.started_at, '+8 hours'),
                               func.sum(models.FocusSession.seconds)).group_by(func.date(models.FocusSession.started_at, '+8 hours')).all()
    active_days = sum(1 for _, value in days if value > 0)
    return {"start_date": start_date, "end_date": end_date, "count": count, "total_seconds": seconds,
            "active_days": active_days, "average_active_day_seconds": seconds // active_days if active_days else 0,
            "limit": limit, "offset": offset, "items": [session_response(row) for row in rows]}


def csv_cell(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else text


@router.get('/csv')
def export_history(start_date: date, end_date: date, db: Session = Depends(get_db)):
    query = range_query(db, start_date, end_date)
    # Bound export allocation; never truncate a report silently.
    rows = query.order_by(models.FocusSession.started_at.desc(), models.FocusSession.id.desc()).limit(5001).all()
    if len(rows) > 5000:
        raise HTTPException(413, '一次最多导出 5000 条记录，请缩小日期区间')
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(['记录编号', '任务名称', '归属日期（中国时区）', '开始时间（UTC）', '结束时间（UTC）', '实际秒数', '目标秒数'])
    for row in rows:
        value = session_response(row)
        writer.writerow([row.id, csv_cell(value['task_name']), (row.started_at + timedelta(hours=8)).date().isoformat(),
                         value['started_at'].isoformat(), value['ended_at'].isoformat(), row.seconds, row.planned_seconds or ''])
    filename = f'daymate-focus-{start_date}-{end_date}.csv'
    return Response(content=('\ufeff' + output.getvalue()).encode('utf-8'), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Cache-Control': 'no-store'})

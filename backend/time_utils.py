from datetime import datetime, timedelta, timezone

LOCAL_TIMEZONE = timezone(timedelta(hours=8))


def now_local():
    return datetime.now(LOCAL_TIMEZONE).replace(tzinfo=None)


def today_local():
    return now_local().date()


def focus_date(session):
    """Attribute a session to its start date in China, including overnight sessions."""
    return session.started_at.replace(tzinfo=timezone.utc).astimezone(LOCAL_TIMEZONE).date()

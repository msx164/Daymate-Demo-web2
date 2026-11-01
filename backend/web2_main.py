"""Isolated Web 2.0 entrypoint; never initializes the original app's database."""
import asyncio
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SANDBOX = (ROOT / '.sandbox').resolve()
STATE = Path(os.environ.get('DAYMATE_WEB2_STATE', SANDBOX / 'development')).resolve()
if not STATE.is_relative_to(SANDBOX):
    raise RuntimeError('Web2 data must stay inside this copy of Daymate/.sandbox')
STATE.mkdir(parents=True, exist_ok=True)
os.environ['DAYMATE_DB_PATH'] = str(STATE / 'bootstrap.sqlite3')
os.environ['DAYMATE_CONFIG_PATH'] = str(STATE / 'ai.env')
os.environ.pop('DAYMATE_DESKTOP_TOKEN', None)

import desktop_security
ORIGINS = ['http://127.0.0.1:5186', 'http://localhost:5186']
desktop_security.allowed_origins = lambda: ORIGINS

from fastapi import Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from community import Store
import database
from main import app

store = Store(STATE / 'community.sqlite3')
private_engines = {}
private_lock = threading.Lock()


def private_db(request: Request):
    user = request.state.user
    uid = user['id']
    # IDs are server-created UUID hex, never filesystem paths supplied by clients.
    with private_lock:
        if uid not in private_engines:
            folder = STATE / 'private'
            folder.mkdir(exist_ok=True)
            engine = create_engine('sqlite:///' + (folder / f'{uid}.sqlite3').as_posix(),
                                   connect_args={'check_same_thread': False})
            database.Base.metadata.create_all(engine)
            with engine.begin() as db:
                db.exec_driver_sql('CREATE UNIQUE INDEX IF NOT EXISTS ix_focus_session_key ON focus_sessions(session_key)')
                db.exec_driver_sql('CREATE UNIQUE INDEX IF NOT EXISTS ix_task_create_key ON tasks(create_key)')
            private_engines[uid] = sessionmaker(bind=engine, autoflush=False)
    with private_engines[uid]() as db:
        yield db


app.dependency_overrides[database.get_db] = private_db
app.title = 'Daymate Web2 · isolated development'


@app.middleware('http')
async def authenticate(request, call_next):
    origin = request.headers.get('origin')
    if origin and origin not in ORIGINS:
        return JSONResponse({'detail': '此隔离服务不接受该来源'}, status_code=403)
    public = {'/api/web2/register', '/api/web2/login', '/api/web2/health'}
    if request.method != 'OPTIONS' and request.url.path not in public:
        try:
            request.state.user = store.auth(request.headers.get('authorization', '').removeprefix('Bearer '))
        except HTTPException as exc:
            return JSONResponse({'detail': exc.detail}, status_code=exc.status_code)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response


class Account(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    login: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class Registration(Account):
    nickname: str = Field(min_length=1, max_length=24)


class Action(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    goal: str = Field(min_length=1, max_length=160)
    minutes: int = Field(ge=1, le=120, strict=True)
    mode: Literal['quiet', 'checkin'] = 'quiet'
    visibility: Literal['public', 'invite'] = 'public'


class Join(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    goal: str = Field(min_length=1, max_length=160)
    room_id: str | None = Field(default=None, max_length=32)
    code: str = Field(default='', max_length=8)


class Command(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    room_id: str | None = Field(default=None, max_length=32)
    status: Literal['working', 'away', 'stuck', 'done'] = 'working'
    body: str = Field(default='', max_length=500)
    result: Literal['done', 'partial', 'not_started'] = 'partial'
    note: str = Field(default='', max_length=1500)
    shared: str = Field(default='', max_length=300)
    target: str | None = Field(default=None, max_length=32)
    reason: str = Field(default='', max_length=1000)


@app.get('/api/web2/health')
def health():
    return {'service': 'daymate-web2', 'isolated': True, 'realtime': 'websocket', 'version': 1}


@app.post('/api/web2/register')
def register(value: Registration):
    return store.account(value.login, value.password, value.nickname)


@app.post('/api/web2/login')
def login(value: Account):
    return store.account(value.login, value.password)


@app.get('/api/web2/me')
def me(request: Request):
    return request.state.user


@app.post('/api/web2/logout')
def logout(request: Request):
    store.logout(request.headers.get('authorization', '').removeprefix('Bearer '))
    return {'ok': True}


@app.get('/api/web2/lobby')
def lobby(request: Request):
    return store.lobby(request.state.user['id'])


@app.get('/api/web2/rooms/{rid}')
def room(rid: str, request: Request):
    return store.room(request.state.user['id'], rid)


def key(request):
    value = request.headers.get('idempotency-key', '')
    if not 8 <= len(value) <= 100:
        raise HTTPException(422, '请提供有效的请求编号')
    return value


@app.post('/api/web2/rooms')
def create(value: Action, request: Request):
    return store.mutate(request.state.user['id'], 'create', value.model_dump(), key(request))


@app.post('/api/web2/join')
def join(value: Join, request: Request):
    return store.mutate(request.state.user['id'], 'join', value.model_dump(), key(request))


@app.post('/api/web2/commands/{op}')
def command(op: Literal['ready', 'status', 'message', 'leave', 'review', 'buddy', 'unbuddy', 'block', 'report'], value: Command, request: Request):
    if op == 'message' and not value.body:
        raise HTTPException(422, '消息不能为空')
    if op == 'report' and not value.reason:
        raise HTTPException(422, '请填写举报原因')
    return store.mutate(request.state.user['id'], op, value.model_dump(), key(request))


@app.get('/api/web2/buddies')
def buddies(request: Request):
    return store.buddies(request.state.user['id'])


@app.websocket('/api/web2/live/{rid}')
async def live(ws: WebSocket, rid: str):
    if ws.headers.get('origin') not in ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), 8)
        user = store.auth(first.get('token', ''))
        last = None
        while True:
            # Revalidate the session so logout also revokes live connections.
            store.auth(first.get('token', ''))
            state = store.room(user['id'], rid)
            version = state['version']
            if version != last:
                await ws.send_json(state)
                last = version
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=1)
            except asyncio.TimeoutError:
                pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except (HTTPException, ValueError, TypeError, AttributeError):
        await ws.close(code=1008)

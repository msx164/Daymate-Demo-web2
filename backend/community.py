"""SQLite-backed two-person action service. Every mutation takes a DB write lock.

No private task IDs, memories, model conversations or focus history are published.
"""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from fastapi import HTTPException


def fail(code, message):
    raise HTTPException(code, message)


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE NOT NULL,
                nickname TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,host TEXT NOT NULL,goal TEXT NOT NULL,
                minutes INTEGER NOT NULL,mode TEXT NOT NULL,visibility TEXT NOT NULL,code TEXT UNIQUE,
                state TEXT NOT NULL,created REAL NOT NULL,deadline REAL NOT NULL,started REAL,ended REAL,
                version INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS members(room TEXT NOT NULL,user TEXT NOT NULL,goal TEXT NOT NULL,
                ready INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'working',joined REAL NOT NULL,
                left_at REAL,PRIMARY KEY(room,user));
            CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL,
                user TEXT NOT NULL,body TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS reviews(room TEXT NOT NULL,user TEXT NOT NULL,result TEXT NOT NULL,
                note TEXT NOT NULL,shared TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(room,user));
            CREATE TABLE IF NOT EXISTS buddies(a TEXT NOT NULL,b TEXT NOT NULL,requester TEXT NOT NULL,
                state TEXT NOT NULL,PRIMARY KEY(a,b));
            CREATE TABLE IF NOT EXISTS blocks(user TEXT NOT NULL,target TEXT NOT NULL,PRIMARY KEY(user,target));
            CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user TEXT NOT NULL,target TEXT NOT NULL,
                room TEXT,reason TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS receipts(user TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,
                result TEXT NOT NULL,PRIMARY KEY(user,key));
            CREATE INDEX IF NOT EXISTS ix_members_user ON members(user);
            CREATE INDEX IF NOT EXISTS ix_messages_room ON messages(room,id);
            ''')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def auth(self, token):
        if not token or len(token) > 200:
            fail(401, '请先登录此隔离版本')
        with self.db() as db:
            user = db.execute('''SELECT u.id,u.login,u.nickname FROM sessions s JOIN users u
                ON u.id=s.user_id WHERE s.token=? AND s.expires>?''',
                (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            if not user:
                fail(401, '登录已过期，请重新登录')
            return dict(user)

    def account(self, login, password, nickname=None):
        login = login.lower().strip()
        if not re.fullmatch(r'[a-z0-9_]{3,32}', login) or not 8 <= len(password) <= 128:
            fail(422, '账号为3—32位字母、数字或下划线；密码为8—128位')
        with self.db() as db:
            user = db.execute('SELECT * FROM users WHERE login=?', (login,)).fetchone()
            if nickname is not None:
                if user:
                    fail(409, '此账号已注册')
                salt = secrets.token_hex(16)
                digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
                db.execute('INSERT INTO users VALUES(?,?,?,?,?)',
                           (uuid.uuid4().hex, login, nickname, salt, digest))
                user = db.execute('SELECT * FROM users WHERE login=?', (login,)).fetchone()
            else:
                salt = user['salt'] if user else '00' * 16
                digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
                if not user or not hmac.compare_digest(user['password'], digest):
                    fail(401, '账号或密码不正确')
            token = secrets.token_urlsafe(32)
            db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
            db.execute('INSERT INTO sessions VALUES(?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), user['id'], time.time() + 7 * 86400))
            return {'token': token, 'user': {k: user[k] for k in ('id', 'login', 'nickname')}}

    def logout(self, token):
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (hashlib.sha256(token.encode()).hexdigest(),))

    def tidy(self, db):
        now = time.time()
        db.execute("UPDATE rooms SET state='expired',ended=?,version=version+1 WHERE state='waiting' AND deadline<=?", (now, now))
        db.execute("UPDATE rooms SET state='ended',version=version+1 WHERE state='active' AND ended<=?", (now,))

    def blocked(self, db, a, b):
        return db.execute('SELECT 1 FROM blocks WHERE (user=? AND target=?) OR (user=? AND target=?)', (a, b, b, a)).fetchone()

    def active(self, db, uid):
        return db.execute("SELECT r.id FROM rooms r JOIN members m ON m.room=r.id WHERE m.user=? AND m.left_at IS NULL AND r.state IN ('waiting','active')", (uid,)).fetchone()

    def require_member(self, db, uid, rid, active=False):
        row = db.execute('SELECT * FROM members WHERE room=? AND user=?', (rid, uid)).fetchone()
        if not row or (active and row['left_at'] is not None):
            fail(403, '你没有此房间的操作权限')
        return row

    def snapshot(self, db, uid, rid):
        viewer = self.require_member(db, uid, rid)
        room = dict(db.execute('SELECT * FROM rooms WHERE id=?', (rid,)).fetchone())
        # Invitation secrets are available only to the host, never the public list.
        if room['host'] != uid:
            room.pop('code')
        room['members'] = [dict(r) for r in db.execute('''SELECT m.user,m.goal,m.ready,m.status,m.joined,m.left_at,u.nickname
            FROM members m JOIN users u ON u.id=m.user WHERE m.room=? ORDER BY m.joined''', (rid,))]
        cutoff = viewer['left_at'] if viewer['left_at'] is not None else time.time() + 1
        room['messages'] = list(reversed([dict(r) for r in db.execute('''SELECT m.id,m.user,m.body,m.created,u.nickname
            FROM messages m JOIN users u ON u.id=m.user WHERE room=? AND created<=? ORDER BY m.id DESC LIMIT 100''', (rid, cutoff))]))
        room['feedback'] = [dict(r) for r in db.execute('''SELECT r.user,r.result,r.shared,u.nickname FROM reviews r
            JOIN users u ON u.id=r.user WHERE room=? AND created<=? AND shared<>'' ''', (rid, cutoff))]
        own = db.execute('SELECT result,note,shared FROM reviews WHERE room=? AND user=?', (rid, uid)).fetchone()
        room['my_review'] = dict(own) if own else None
        room['server_time'] = time.time()
        return room

    def room(self, uid, rid):
        with self.db() as db:
            self.tidy(db)
            return self.snapshot(db, uid, rid)

    def lobby(self, uid):
        with self.db() as db:
            self.tidy(db)
            rows = db.execute('''SELECT r.id,r.goal,r.minutes,r.mode,r.created,r.deadline,u.nickname,
                (SELECT count(*) FROM members m WHERE m.room=r.id AND m.left_at IS NULL) AS occupants
                FROM rooms r JOIN users u ON u.id=r.host WHERE r.state='waiting' AND r.visibility='public'
                ORDER BY r.created DESC LIMIT 100''').fetchall()
            cards = []
            for row in rows:
                members = db.execute('SELECT user FROM members WHERE room=?', (row['id'],)).fetchall()
                if row['occupants'] < 2 and not any(self.blocked(db, uid, m['user']) for m in members):
                    cards.append(dict(row))
            current = self.active(db, uid)
            history = [dict(x) for x in db.execute('''SELECT r.id,r.goal,r.state,r.started,r.ended,r.created,
                v.result,v.note FROM rooms r JOIN members m ON m.room=r.id LEFT JOIN reviews v
                ON v.room=r.id AND v.user=m.user WHERE m.user=? ORDER BY r.created DESC LIMIT 30''', (uid,))]
            return {'rooms': cards, 'current': current['id'] if current else None, 'history': history, 'server_time': time.time()}

    def mutate(self, uid, op, data, key):
        fingerprint = json.dumps([op, data], sort_keys=True, ensure_ascii=False)
        with self.db() as db:
            self.tidy(db)
            old = db.execute('SELECT * FROM receipts WHERE user=? AND key=?', (uid, key)).fetchone()
            if old:
                if old['fingerprint'] != fingerprint:
                    fail(409, '此请求编号已用于其他内容，请重新操作')
                return json.loads(old['result'])
            result = self.perform(db, uid, op, data)
            db.execute('INSERT INTO receipts VALUES(?,?,?,?)', (uid, key, fingerprint, json.dumps(result)))
            return result

    def perform(self, db, uid, op, data):
        now = time.time()
        if op == 'create':
            if self.active(db, uid):
                fail(409, '请先结束或离开当前行动')
            rid = uuid.uuid4().hex
            code = secrets.token_hex(4).upper()
            db.execute('''INSERT INTO rooms(id,host,goal,minutes,mode,visibility,code,state,created,deadline)
                VALUES(?,?,?,?,?,?,?,'waiting',?,?)''',
                (rid, uid, data['goal'], data['minutes'], data['mode'], data['visibility'], code, now, now + 180))
            db.execute('INSERT INTO members(room,user,goal,joined) VALUES(?,?,?,?)', (rid, uid, data['goal'], now))
            return {'room_id': rid}
        if op == 'join':
            room = db.execute('SELECT * FROM rooms WHERE id=?', (data.get('room_id'),)).fetchone() if data.get('room_id') else db.execute('SELECT * FROM rooms WHERE code=?', (data.get('code', '').upper(),)).fetchone()
            if not room:
                fail(404, '行动不存在或邀请码不正确')
            rid = room['id']
            if room['visibility'] == 'invite' and data.get('code', '').upper() != room['code']:
                fail(403, '此行动需要邀请码')
            if room['state'] != 'waiting':
                fail(409, '此行动已经开始或结束')
            if self.active(db, uid):
                fail(409, '请先结束或离开当前行动')
            members = db.execute('SELECT * FROM members WHERE room=? AND left_at IS NULL', (rid,)).fetchall()
            if len(members) >= 2:
                fail(409, '此行动已经满员')
            if db.execute('SELECT 1 FROM members WHERE room=? AND user=?', (rid, uid)).fetchone():
                fail(409, '已离开的行动不能重新加入，请创建下一轮')
            if any(self.blocked(db, uid, m['user']) for m in members):
                fail(403, '无法加入此行动')
            db.execute('INSERT INTO members(room,user,goal,joined) VALUES(?,?,?,?)', (rid, uid, data['goal'], now))
            db.execute('UPDATE rooms SET version=version+1 WHERE id=?', (rid,))
            return {'room_id': rid}
        rid = data.get('room_id')
        if op in ('ready', 'status', 'message', 'leave', 'review'):
            member = self.require_member(db, uid, rid, active=op != 'review')
            room = db.execute('SELECT * FROM rooms WHERE id=?', (rid,)).fetchone()
            if op == 'ready':
                if room['state'] != 'waiting':
                    fail(409, '房间已不在准备阶段')
                db.execute('UPDATE members SET ready=1 WHERE room=? AND user=?', (rid, uid))
                count = db.execute('SELECT count(*),sum(ready) FROM members WHERE room=? AND left_at IS NULL', (rid,)).fetchone()
                if count[0] == 2 and count[1] == 2:
                    db.execute("UPDATE rooms SET state='active',started=?,ended=? WHERE id=?", (now, now + room['minutes'] * 60, rid))
            elif op == 'status':
                if room['state'] != 'active':
                    fail(409, '只有行动中可以更新状态')
                db.execute('UPDATE members SET status=? WHERE room=? AND user=?', (data['status'], rid, uid))
            elif op == 'message':
                if room['state'] not in ('waiting', 'active', 'ended'):
                    fail(409, '此房间已关闭')
                last = db.execute('SELECT max(created) FROM messages WHERE user=?', (uid,)).fetchone()[0]
                if last and now - last < 1:
                    fail(429, '消息发送较快，请稍后再试')
                db.execute('INSERT INTO messages(room,user,body,created) VALUES(?,?,?,?)', (rid, uid, data['body'], now))
            elif op == 'leave':
                db.execute('UPDATE members SET left_at=? WHERE room=? AND user=?', (now, rid, uid))
                if room['state'] == 'waiting':
                    if room['host'] == uid:
                        db.execute("UPDATE rooms SET state='cancelled',ended=? WHERE id=?", (now, rid))
                    else:
                        db.execute('UPDATE members SET ready=0 WHERE room=?', (rid,))
                # During an active session, partner departure never stops the clock.
            elif op == 'review':
                if room['state'] == 'active' and member['left_at'] is None:
                    fail(409, '请等本轮结束，或先结束自己的行动再复盘')
                db.execute('''INSERT INTO reviews VALUES(?,?,?,?,?,?) ON CONFLICT(room,user) DO UPDATE
                    SET result=excluded.result,note=excluded.note,shared=excluded.shared,created=excluded.created''',
                    (rid, uid, data['result'], data['note'], data['shared'], now))
            db.execute('UPDATE rooms SET version=version+1 WHERE id=?', (rid,))
            return {'room_id': rid}
        target = data.get('target')
        if not target or target == uid or not db.execute('SELECT 1 FROM users WHERE id=?', (target,)).fetchone():
            fail(422, '无效的伙伴')
        a, b = sorted((uid, target))
        if op == 'buddy':
            if self.blocked(db, uid, target):
                fail(403, '无法发送搭子邀请')
            if not db.execute('''SELECT 1 FROM members x JOIN members y ON x.room=y.room
                WHERE x.user=? AND y.user=?''', (uid, target)).fetchone():
                fail(403, '仅可邀请曾经同行的伙伴')
            old = db.execute('SELECT * FROM buddies WHERE a=? AND b=?', (a, b)).fetchone()
            if old and old['state'] == 'pending' and old['requester'] != uid:
                db.execute("UPDATE buddies SET state='accepted' WHERE a=? AND b=?", (a, b))
            elif not old:
                db.execute("INSERT INTO buddies VALUES(?,?,?,'pending')", (a, b, uid))
        elif op == 'unbuddy':
            db.execute('DELETE FROM buddies WHERE a=? AND b=?', (a, b))
        elif op == 'block':
            db.execute('INSERT OR IGNORE INTO blocks VALUES(?,?)', (uid, target))
            db.execute('DELETE FROM buddies WHERE a=? AND b=?', (a, b))
            rows = db.execute('''SELECT x.room FROM members x JOIN members y ON x.room=y.room
                JOIN rooms r ON r.id=x.room WHERE x.user=? AND y.user=? AND x.left_at IS NULL
                AND r.state IN ('waiting','active')''', (uid, target)).fetchall()
            for row in rows:
                self.perform(db, uid, 'leave', {'room_id': row['room']})
        elif op == 'report':
            self.require_member(db, uid, data['room_id'])
            if not db.execute('SELECT 1 FROM members WHERE room=? AND user=?', (data['room_id'], target)).fetchone():
                fail(422, '举报对象不在此房间')
            db.execute('INSERT INTO reports VALUES(?,?,?,?,?,?)', (uuid.uuid4().hex, uid, target, data['room_id'], data['reason'], now))
        else:
            fail(422, '不支持的操作')
        return {'ok': True}

    def buddies(self, uid):
        with self.db() as db:
            rows = db.execute('''SELECT b.*,u.id AS target,u.nickname FROM buddies b JOIN users u
                ON u.id=CASE WHEN b.a=? THEN b.b ELSE b.a END WHERE b.a=? OR b.b=?''', (uid, uid, uid)).fetchall()
            return [dict(r) for r in rows if not self.blocked(db, uid, r['target'])]

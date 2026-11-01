"""Security and lifecycle checks; uses only a temporary directory in this copy."""
import concurrent.futures
import os
import tempfile
import time
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
(ROOT / '.sandbox' / 'tests').mkdir(parents=True, exist_ok=True)
TEMP = tempfile.TemporaryDirectory(dir=ROOT / '.sandbox' / 'tests')
os.environ['DAYMATE_WEB2_STATE'] = TEMP.name
from fastapi.testclient import TestClient
from web2_main import app, store, private_engines, STATE
from fastapi import HTTPException


class Web2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def account(self):
        result = self.client.post('/api/web2/register', json={'login': 'u'+uuid.uuid4().hex[:12], 'password': 'password-1234', 'nickname': '同行者'})
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        return data['user']['id'], {'Authorization': 'Bearer '+data['token']}, data['token']

    def post(self, path, payload, headers, key=None):
        return self.client.post('/api/web2'+path, json=payload, headers={**headers, 'Idempotency-Key': key or uuid.uuid4().hex})

    def make(self, headers, **extra):
        response=self.post('/rooms', {'goal': '写报告提纲', 'minutes': 25, 'mode': 'quiet', 'visibility': 'public', **extra}, headers)
        self.assertEqual(response.status_code,200,response.text)
        return response.json()['room_id']

    def test_private_legacy_tasks_and_unauthenticated_access(self):
        a, ha, _ = self.account(); b, hb, _ = self.account()
        self.assertEqual(self.client.get('/api/tasks').status_code, 401)
        task={'name': 'private secret 123', 'start_time':'09:00','end_time':'10:00','task_type':'study'}
        r=self.client.post('/api/tasks',json=task,headers=ha);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(len(self.client.get('/api/tasks',headers=ha).json()),1)
        self.assertEqual(self.client.get('/api/tasks',headers=hb).json(),[])
        self.assertEqual(self.client.delete('/api/tasks/'+str(r.json()['id']),headers=hb).status_code,404)
        self.assertTrue((STATE/'private'/f'{a}.sqlite3').exists())
        self.assertTrue((STATE/'private'/f'{b}.sqlite3').exists())

    def test_two_ready_start_once_and_capacity_race(self):
        a,ha,_=self.account();b,hb,_=self.account();c,hc,_=self.account();rid=self.make(ha)
        def join(headers):return self.post('/join',{'goal':'阅读十页','room_id':rid},headers).status_code
        with concurrent.futures.ThreadPoolExecutor() as pool:codes=list(pool.map(join,[hb,hc]))
        self.assertEqual(sorted(codes),[200,409])
        partner=hb if codes[0]==200 else hc
        self.post('/commands/ready',{'room_id':rid},ha)
        self.assertEqual(store.room(a,rid)['state'],'waiting')
        self.post('/commands/ready',{'room_id':rid},partner)
        started=store.room(a,rid)['started'];self.assertIsNotNone(started)
        self.post('/commands/ready',{'room_id':rid},partner)
        self.assertEqual(store.room(a,rid)['started'],started)
        self.assertEqual(store.room(a,rid)['ended']-started,1500)

    def test_invite_secret_and_idempotency(self):
        a,ha,_=self.account();b,hb,_=self.account();key=uuid.uuid4().hex
        payload={'goal':'private invitation','minutes':15,'mode':'quiet','visibility':'invite'}
        r=self.post('/rooms',payload,ha,key);rid=r.json()['room_id']
        self.assertEqual(self.post('/rooms',payload,ha,key).json(),r.json())
        self.assertEqual(self.post('/rooms',{**payload,'minutes':45},ha,key).status_code,409)
        self.assertNotIn(rid,[x['id'] for x in self.client.get('/api/web2/lobby',headers=hb).json()['rooms']])
        self.assertEqual(self.post('/join',{'room_id':rid,'goal':'test'},hb).status_code,403)
        self.assertEqual(self.client.get('/api/web2/rooms/'+rid,headers=hb).status_code,403)
        code=store.room(a,rid)['code']
        self.assertEqual(self.post('/join',{'code':code,'goal':'my task'},hb).status_code,200)
        self.assertNotIn('code',store.room(b,rid))

    def test_departure_does_not_stop_partner_and_review_privacy(self):
        a,ha,_=self.account();b,hb,_=self.account();rid=self.make(ha)
        self.post('/join',{'goal':'伙伴目标','room_id':rid},hb)
        for h in [ha,hb]:self.post('/commands/ready',{'room_id':rid},h)
        end=store.room(a,rid)['ended']
        self.post('/commands/leave',{'room_id':rid},hb)
        self.assertEqual(store.room(a,rid)['state'],'active');self.assertEqual(store.room(a,rid)['ended'],end)
        self.assertEqual(self.post('/commands/message',{'room_id':rid,'body':'still here'},hb).status_code,403)
        self.post('/commands/review',{'room_id':rid,'result':'partial','note':'PRIVATE NOTE','shared':'推进了一点'},hb)
        snapshot=store.room(a,rid)
        self.assertNotIn('PRIVATE NOTE',str(snapshot));self.assertIsNone(snapshot['my_review'])
        self.assertEqual(snapshot['feedback'][0]['shared'],'推进了一点')

    def test_buddies_need_mutual_acceptance_and_block_prevents_join(self):
        a,ha,_=self.account();b,hb,_=self.account();rid=self.make(ha)
        self.post('/join',{'goal':'reading','room_id':rid},hb)
        self.post('/commands/buddy',{'target':b},ha)
        self.assertEqual(store.buddies(a)[0]['state'],'pending')
        self.post('/commands/buddy',{'target':a},hb)
        self.assertEqual(store.buddies(a)[0]['state'],'accepted')
        self.post('/commands/block',{'target':b},ha)
        self.assertEqual(store.buddies(a),[])
        other=self.make(hb)
        self.assertEqual(self.post('/join',{'room_id':other,'goal':'test'},ha).status_code,403)

    def test_expiry_logout_and_websocket_membership(self):
        a,ha,token=self.account();b,hb,bt=self.account();rid=self.make(ha)
        with self.client.websocket_connect('/api/web2/live/'+rid,headers={'origin':'http://127.0.0.1:5186'}) as ws:
            ws.send_json({'token':token});self.assertEqual(ws.receive_json()['id'],rid)
        with store.db() as db:db.execute('UPDATE rooms SET deadline=? WHERE id=?',(time.time()-1,rid))
        self.assertEqual(store.room(a,rid)['state'],'expired')
        self.assertEqual(self.post('/join',{'goal':'late','room_id':rid},hb).status_code,409)
        self.assertEqual(self.client.get('/api/tasks',headers={**ha,'Origin':'http://evil.example'}).status_code,403)
        self.post('/logout',{},ha)
        self.assertEqual(self.client.get('/api/web2/me',headers=ha).status_code,401)

    @classmethod
    def tearDownClass(cls):
        for factory in private_engines.values():factory.kw['bind'].dispose()
        import database
        database.engine.dispose()
        TEMP.cleanup()


if __name__=='__main__':unittest.main(verbosity=2)

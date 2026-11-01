from pathlib import Path
import shutil, json

ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'.build/public'
SRC=ROOT
BACK=BUILD/'backend'
BACK.mkdir(parents=True,exist_ok=True)
for p in (SRC/'backend').glob('*.py'):shutil.copy2(p,BACK/p.name)
p=BACK/'web2_main.py'
s=p.read_text('utf-8').replace('ROOT = Path(__file__).resolve().parents[1]',"ROOT = Path(os.environ['DAYMATE_PUBLIC_ROOT']) if os.environ.get('DAYMATE_PUBLIC_ROOT') else Path(__file__).resolve().parents[1]").replace('5186','5188')
p.write_text(s,'utf-8')
(BACK/'public_server.py').write_text('''import os,sys,threading,http.server,functools,socket
from pathlib import Path
def main():
    for k in list(os.environ):
        if k.startswith('DAYMATE_'): del os.environ[k]
    root=Path(os.environ['LOCALAPPDATA'])/'DaymateWeb2Public'
    root.mkdir(parents=True,exist_ok=True)
    os.environ['DAYMATE_PUBLIC_ROOT']=str(root)
    os.environ['DAYMATE_WEB2_STATE']=str(root/'.sandbox/development')
    os.environ['PYTHONDONTWRITEBYTECODE']='1'
    for port in (8018,5188):
        with socket.socket() as probe: probe.bind(('127.0.0.1',port))
    assets=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))/'frontend'
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            if self.path.split('?')[0]=='/__daymate_public__':
                self.send_response(200);self.end_headers();self.wfile.write(b'daymate-web2-public');return
            super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',5188),functools.partial(Handler,directory=str(assets)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    import uvicorn,web2_main
    uvicorn.run(web2_main.app,host='127.0.0.1',port=8018,log_level='warning',access_log=False)
if __name__=='__main__': main()
''','utf-8')
print('Prepared isolated public package sources')

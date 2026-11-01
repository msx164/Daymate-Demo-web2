"""Restore large optional vision assets from pinned sources and verify hashes."""
from pathlib import Path
import hashlib
import json
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'frontend/public/vision'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    manifest = json.loads((Path(__file__).with_name('vision-assets.json')).read_text(encoding='utf-8'))
    for item in manifest:
        dest = ASSETS / item['path']
        if dest.is_file() and digest(dest) == item['sha256']:
            print('Verified:', item['path'])
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_name(dest.name + '.download')
        try:
            if 'dependency' in item:
                source = ROOT / 'frontend/node_modules/@mediapipe/tasks-vision/wasm' / item['dependency']
                if not source.is_file():
                    raise RuntimeError('Run npm ci in frontend before preparing assets.')
                shutil.copyfile(source, temp)
            else:
                with urllib.request.urlopen(item['url'], timeout=120) as response, temp.open('wb') as output:
                    shutil.copyfileobj(response, output)
            if digest(temp) != item['sha256']:
                raise RuntimeError('Hash mismatch for ' + item['path'])
            temp.replace(dest)
            print('Prepared:', item['path'])
        finally:
            temp.unlink(missing_ok=True)

if __name__ == '__main__':
    main()

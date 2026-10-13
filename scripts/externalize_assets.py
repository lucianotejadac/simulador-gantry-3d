"""Publish heavy payloads as content-addressed files, preserving exact bytes.

Run after any legacy builder that embeds data. Safe to run repeatedly.
Serve the repository over HTTP (GitHub Pages or python -m http.server).
"""
from pathlib import Path
import base64
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def asset(raw, label, extension):
    name = f'{label}.{hashlib.sha256(raw).hexdigest()[:16]}.{extension}'
    relative = Path('assets/runtime') / name
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(raw)
    return relative.as_posix()


def externalize():
    page = ROOT / 'index.html'
    html = page.read_text(encoding='utf-8')
    before = len(html.encode('utf-8'))

    def icrp(match):
        data = json.loads(match[1])
        for name, pose in data.items():
            if 'deflate' in pose:
                pose['url'] = asset(base64.b64decode(pose.pop('deflate')), 'icrp-' + name, 'deflate')
        return 'window.GANTRY_ICRP_DATA=' + json.dumps(data, separators=(',', ':')) + ';\n'

    def mag3(match):
        data = json.loads(match[1])
        if 'packed' in data:
            data['urls'] = {name: asset(base64.b64decode(value), 'mag3-' + name, 'deflate')
                            for name, value in data.pop('packed').items()}
        if 'integral' in data:
            raw = json.dumps(data.pop('integral'), separators=(',', ':')).encode('utf-8')
            data['integralUrl'] = asset(raw, 'mag3-kinetics', 'json')
        return 'window.GANTRY_MAG3_DATA=' + json.dumps(data, separators=(',', ':')) + ';\n'

    html = re.sub(r'window.GANTRY_ICRP_DATA=(.*?);\n', icrp, html)
    html = re.sub(r'window.GANTRY_MAG3_DATA=(.*?);\n', mag3, html)

    def room(match):
        url = asset(base64.b64decode(match[1]), 'symbia-room', 'bin')
        return f'<script id="symbiaRoomData" type="application/octet-stream" data-src="{url}"></script>'

    html = re.sub(r'<script id="symbiaRoomData" type="application/octet-stream">([A-Za-z0-9+/=]+)</script>', room, html)

    def uri(match):
        mime, encoded = match.groups()
        extension = {'image/png': 'png', 'image/jpeg': 'jpg', 'model/gltf-binary': 'glb'}.get(mime)
        if extension is None or len(encoded) < 10000:
            return match[0]
        return asset(base64.b64decode(encoded), 'image' if mime.startswith('image/') else 'patient', extension)

    html = re.sub(r'data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)', uri, html)
    page.write_text(html, encoding='utf-8', newline='\n')
    print(f'HTML: {before:,} -> {len(html.encode("utf-8")):,} bytes; external assets in assets/runtime')


if __name__ == '__main__':
    externalize()

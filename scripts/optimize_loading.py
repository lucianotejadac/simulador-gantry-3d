"""Package identical atlas bytes into parallel downloads and cache the 3D library.

Run last, after the study/embed builders. Old URLs remain valid for cached pages.
"""
from pathlib import Path
import json
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
PART_SIZE = 512 * 1024


def optimize():
    page = ROOT / 'index.html'
    html = page.read_text(encoding='utf-8')
    html = re.sub(r'<!-- FAST_LOAD_BEGIN -->.*?<!-- FAST_LOAD_END -->\n?', '', html, flags=re.S)
    # The library is unchanged; separating it makes it cacheable across HTML edits.
    def library(match):
        code = match[1]
        if 'window.GANTRY_THREE={' not in code:
            return match[0]
        return '<script src="' + asset(code.encode('utf-8'), 'three-bundle', 'js') + '"></script>'
    html = re.sub(r'<script>(.*?)</script>', library, html, flags=re.S)
    urls = set(re.findall(r'assets/runtime/[\w.-]+', html))
    manifest = {}
    for url in sorted(urls):
        path = ROOT / url
        if path.suffix not in ('.bin', '.deflate', '.json') or path.stat().st_size < 2_000_000:
            continue
        raw = path.read_bytes()
        manifest[url] = [[asset(raw[i:i+PART_SIZE], 'atlas-part', 'bin'), len(raw[i:i+PART_SIZE])]
                         for i in range(0, len(raw), PART_SIZE)]
    preloads = []
    for url in sorted(urls):
        if url.endswith('.js'):
            preloads.append(f'<link rel="preload" href="{url}" as="script">')
        elif any(tag in url for tag in ('/patient.', '/symbia-room.')):
            preloads.append(f'<link rel="preload" href="{url}" as="fetch" crossorigin>')
    transport = (ROOT / 'scripts/asset_transport.js').read_text(encoding='utf-8')
    block = '<!-- FAST_LOAD_BEGIN -->\n' + '\n'.join(preloads)
    block += '\n<script>window.GANTRY_ASSET_PARTS=' + json.dumps(manifest, separators=(',', ':')) + ';\n'
    block += transport + '</script>\n<!-- FAST_LOAD_END -->\n'
    html = html.replace('</head>', block + '</head>', 1)
    page.write_text(html, encoding='utf-8', newline='\n')
    print(f'HTML: {len(html.encode("utf-8")):,} bytes; {len(manifest)} atlases split losslessly')


if __name__ == '__main__':
    optimize()

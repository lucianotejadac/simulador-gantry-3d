"""Package the workspace layout independently of study/acquisition builders."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
url = asset((ROOT / 'scripts/gantry_workspace.css').read_bytes(), 'gantry-workspace', 'css')
block = '<!-- WORKSPACE_LAYOUT_BEGIN -->\n<link rel="stylesheet" href="' + url + '">\n<!-- WORKSPACE_LAYOUT_END -->'
if '<!-- WORKSPACE_LAYOUT_BEGIN -->' in html:
    html = re.sub(r'<!-- WORKSPACE_LAYOUT_BEGIN -->.*?<!-- WORKSPACE_LAYOUT_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('</head>', block + '\n</head>', 1)
anchor = '<div style="flex:none;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
if 'id="gantryViewControls"' not in html:
    assert html.count(anchor) == 1
    html = html.replace(anchor, anchor.replace('<div ', '<div id="gantryViewControls" '), 1)
page.write_text(html, encoding='utf-8', newline='\n')
print('Workspace layout embedded')

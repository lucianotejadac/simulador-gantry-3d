"""Publish lightweight numeric feedback separately from the simulation engines."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
js = asset((ROOT / 'scripts/value_feedback.js').read_bytes(), 'value-feedback', 'js')
css = asset((ROOT / 'scripts/value_feedback.css').read_bytes(), 'value-feedback', 'css')
block = f'<!-- VALUE_FEEDBACK_BEGIN -->\n<link rel="stylesheet" href="{css}">\n<script src="{js}"></script>\n<!-- VALUE_FEEDBACK_END -->'
if '<!-- VALUE_FEEDBACK_BEGIN -->' in html:
    html = re.sub(r'<!-- VALUE_FEEDBACK_BEGIN -->.*?<!-- VALUE_FEEDBACK_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('<!-- EXAM_SAFETY_BEGIN -->', block + '\n<!-- EXAM_SAFETY_BEGIN -->', 1)
# Only manual moves trigger feedback; automatic whole-body scan motion does not.
if 'GANTRY_VALUE_FEEDBACK?.changed()' not in html:
    html = html.replace('      Object.assign(G,result.state);render();',
        '      if(Object.keys(G).some(key=>G[key]!==result.state[key]))window.GANTRY_VALUE_FEEDBACK?.changed();\n      Object.assign(G,result.state);render();', 1)
    html = html.replace('    G[g]=v; render(); return true;',
        '    window.GANTRY_VALUE_FEEDBACK?.changed();\n    G[g]=v; render(); return true;', 1)
page.write_text(html, encoding='utf-8', newline='\n')
print('Numeric change feedback embedded')

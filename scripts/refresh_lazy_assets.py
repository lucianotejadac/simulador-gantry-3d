"""Refresh runtime loaders and extract all large payloads from the page."""
from pathlib import Path
import re
from externalize_assets import externalize

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
for marker, name in [('ICRP145', 'icrp_live.js'), ('MAG3', 'mag3_acquisition.js')]:
    pattern = rf'(<!-- {marker}_BEGIN -->\n<script>\s*window.GANTRY_\w+_DATA=.*?;\n).*?(\n</script>\n<!-- {marker}_END -->)'
    engine = (ROOT / 'scripts' / name).read_text(encoding='utf-8')
    html, count = re.subn(pattern, lambda m: m[1] + engine + m[2], html, flags=re.S)
    assert count == 1, marker

room = (ROOT / 'scripts/symbia_room.js').read_text(encoding='utf-8')
start = html.index('/* Optional static scenery.')
end = html.index('</script>', start)
html = html[:start] + room + '\n' + html[end:]

loader = (ROOT / 'scripts/live_asset_loader.js').read_text(encoding='utf-8')
block = '  // LAZY_STUDY_BEGIN\n' + loader + '  // LAZY_STUDY_END\n'
if '// LAZY_STUDY_BEGIN' in html:
    html = re.sub(r'  // LAZY_STUDY_BEGIN.*?  // LAZY_STUDY_END\n', lambda _: block, html, flags=re.S)
else:
    start = html.index('  Object.values(studies).flatMap(')
    end = html.index('  setInterval(()=>{', start)
    html = html[:start] + block + html[end:]
    anchor = '    lastState=Object.assign({},G);\n    ready=activeAtlas().ready;'
    assert anchor in html
    html = html.replace(anchor, '    lastState=Object.assign({},G);\n    ensureActiveAtlas();\n    ready=activeAtlas().ready;', 1)
    # A fresh selection retries a failed download; regular animation does not.
    anchor = "    acquisition.study=studies[study] ? study : 'thyroid';"
    html = html.replace(anchor, anchor + '\n    activeAtlas().error=false;', 1)

page.write_text(html, encoding='utf-8', newline='\n')
externalize()

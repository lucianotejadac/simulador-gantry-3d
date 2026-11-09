"""Package the guided acquisition exercise without rebuilding physics assets."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
js = '\n'.join((ROOT / 'scripts' / name).read_text(encoding='utf-8') for name in
               ['acquisition_tutorial_model.js', 'acquisition_tutorial_spotlight.js', 'acquisition_tutorial.js'])
css = (ROOT / 'scripts/acquisition_tutorial.css').read_bytes()
block = ('<!-- ACQUISITION_TUTORIAL_BEGIN -->\n<link rel="stylesheet" href="' +
         asset(css, 'acquisition-tutorial', 'css') + '">\n<script src="' +
         asset(js.encode('utf-8'), 'acquisition-tutorial', 'js') +
         '"></script>\n<!-- ACQUISITION_TUTORIAL_END -->')
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
if '<!-- ACQUISITION_TUTORIAL_BEGIN -->' in html:
    html = re.sub(r'<!-- ACQUISITION_TUTORIAL_BEGIN -->.*?<!-- ACQUISITION_TUTORIAL_END -->',
                  lambda _: block, html, flags=re.S)
else:
    html = html.replace('</body>', block + '\n</body>', 1)
page.write_text(html, encoding='utf-8', newline='\n')
print('Acquisition tutorial packaged.')

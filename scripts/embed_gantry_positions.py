"""Package generic automatic detector positioning independently of studies."""
from pathlib import Path
import re
from externalize_assets import asset
root=Path(__file__).resolve().parents[1]
page=root/'index.html'
html=page.read_text(encoding='utf-8')
url=asset((root/'scripts/gantry_positions.js').read_bytes(),'gantry-positions','js')
block='<!-- GANTRY_POSITIONS_BEGIN -->\n<script src="'+url+'"></script>\n<!-- GANTRY_POSITIONS_END -->'
if '<!-- GANTRY_POSITIONS_BEGIN -->' in html:
    html=re.sub(r'<!-- GANTRY_POSITIONS_BEGIN -->.*?<!-- GANTRY_POSITIONS_END -->',lambda _:block,html,flags=re.S)
else:
    html=html.replace('</body>',block+'\n</body>',1)
page.write_text(html,encoding='utf-8',newline='\n')
print('Automatic detector positions embedded')

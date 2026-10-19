"""Package generic automatic detector positioning independently of studies."""
from pathlib import Path
import re
from externalize_assets import asset
root=Path(__file__).resolve().parents[1]
page=root/'index.html'
html=page.read_text(encoding='utf-8')
setup_url=asset((root/'scripts/gantry_setups.js').read_bytes(),'gantry-setups','js')
setup_block='<!-- GANTRY_SETUPS_BEGIN -->\n<script src="'+setup_url+'"></script>\n<!-- GANTRY_SETUPS_END -->'
if '<!-- GANTRY_SETUPS_BEGIN -->' in html:
    html=re.sub(r'<!-- GANTRY_SETUPS_BEGIN -->.*?<!-- GANTRY_SETUPS_END -->',lambda _:setup_block,html,flags=re.S)
else:
    html=html.replace('<!-- COLLISION_ENGINE_BEGIN -->',setup_block+'\n<!-- COLLISION_ENGINE_BEGIN -->',1)
    # This block precedes the asynchronous 3D module and live initialization.
url=asset((root/'scripts/gantry_positions.js').read_bytes(),'gantry-positions','js')
block='<!-- GANTRY_POSITIONS_BEGIN -->\n<script src="'+url+'"></script>\n<!-- GANTRY_POSITIONS_END -->'
if '<!-- GANTRY_POSITIONS_BEGIN -->' in html:
    html=re.sub(r'<!-- GANTRY_POSITIONS_BEGIN -->.*?<!-- GANTRY_POSITIONS_END -->',lambda _:block,html,flags=re.S)
else:
    html=html.replace('</body>',block+'\n</body>',1)
page.write_text(html,encoding='utf-8',newline='\n')
print('Automatic detector positions embedded')

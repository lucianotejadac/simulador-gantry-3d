"""Publish the pixel-count inspector independently of acquisition data."""
from pathlib import Path
import re
from externalize_assets import asset

root=Path(__file__).resolve().parents[1]
page=root/'index.html'
html=page.read_text(encoding='utf-8')
js=asset((root/'scripts/pixel_grid.js').read_bytes(),'pixel-grid','js')
css=asset((root/'scripts/pixel_grid.css').read_bytes(),'pixel-grid','css')
block=f'<!-- PIXEL_GRID_BEGIN -->\n<link rel="stylesheet" href="{css}">\n<script src="{js}"></script>\n<!-- PIXEL_GRID_END -->'
if '<!-- PIXEL_GRID_BEGIN -->' in html:
    html=re.sub(r'<!-- PIXEL_GRID_BEGIN -->.*?<!-- PIXEL_GRID_END -->',lambda _:block,html,flags=re.S)
else:
    html=html.replace('<!-- FINAL_PREVIEW_BEGIN -->',block+'\n<!-- FINAL_PREVIEW_BEGIN -->',1)
page.write_text(html,encoding='utf-8',newline='\n')
print('Pixel-count grids embedded')

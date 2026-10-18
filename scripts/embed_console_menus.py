"""Install the menu-only console without replacing acquisition engine controls."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
js = asset((ROOT/'scripts/console_menus.js').read_bytes(), 'console-menus', 'js')
css = asset((ROOT/'scripts/console_menus.css').read_bytes(), 'console-menus', 'css')
block = f'<!-- CONSOLE_MENUS_BEGIN -->\n<link rel="stylesheet" data-console-menus href="{css}">\n<script src="{js}"></script>\n<!-- CONSOLE_MENUS_END -->'
if '<!-- CONSOLE_MENUS_BEGIN -->' in html:
    html = re.sub(r'<!-- CONSOLE_MENUS_BEGIN -->.*?<!-- CONSOLE_MENUS_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('</body>', block+'\n</body>', 1)
page.write_text(html, encoding='utf-8', newline='\n')
print('Menu-only acquisition console embedded')

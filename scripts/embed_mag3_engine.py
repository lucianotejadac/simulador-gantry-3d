"""Refresh JS implementation without recomputing the anatomical projections."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=root/'index.html';html=p.read_text(encoding='utf-8')
engine=(root/'scripts/mag3_acquisition.js').read_text(encoding='utf-8')
pattern=r'(<!-- MAG3_BEGIN -->\n<script>window.GANTRY_MAG3_DATA=.*?;\n).*?(\n</script>\n<!-- MAG3_END -->)'
html,count=re.subn(pattern,lambda m:m[1]+engine+m[2],html,flags=re.S)
assert count==1
p.write_text(html,encoding='utf-8')
print('MAG3 engine embedded')

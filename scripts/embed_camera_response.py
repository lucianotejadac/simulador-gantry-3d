"""Embed a small cacheable response model and equipment-only provenance."""
from pathlib import Path
import json,re
from externalize_assets import asset
ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'index.html'
s=page.read_text(encoding='utf-8')
data=json.loads((ROOT/'assets/physics/siemens-recovered-equipment.json').read_text(encoding='utf-8'))
code='window.GANTRY_CAMERA_DATA='+json.dumps(data,separators=(',',':'))+';\n'+(ROOT/'scripts/camera_response.js').read_text(encoding='utf-8')
url=asset(code.encode('utf-8'),'camera-response','js')
block='<!-- CAMERA_RESPONSE_BEGIN -->\n<script src="'+url+'"></script>\n<!-- CAMERA_RESPONSE_END -->\n'
if '<!-- CAMERA_RESPONSE_BEGIN -->' in s:
    s=re.sub(r'<!-- CAMERA_RESPONSE_BEGIN -->.*?<!-- CAMERA_RESPONSE_END -->\n',lambda _:block,s,flags=re.S)
else:
    s=s.replace('<!-- ICRP145_BEGIN -->',block+'<!-- ICRP145_BEGIN -->',1)
a=s.index('/* Motor lineal y ventana de persistencia.')
b=s.index('</script>',a)
s=s[:a]+(ROOT/'scripts/icrp_live.js').read_text(encoding='utf-8')+s[b:]
page.write_text(s,encoding='utf-8',newline='\n')
print(url)

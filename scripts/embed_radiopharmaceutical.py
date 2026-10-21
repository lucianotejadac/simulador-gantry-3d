"""Install the shared gantry administration panel and pre-injection signal gate."""
from pathlib import Path
import re
from externalize_assets import asset
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
url=asset((ROOT/'scripts/radiopharmaceutical.js').read_bytes(),'radiopharmaceutical','js')
block=f'''<!-- RADIOPHARMACEUTICAL_BEGIN -->
<style>
#rfPanel{{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#16232d;color:#d4e8ee;border:1px solid #42586b;font:12px Arial,sans-serif}}
#rfPanel label{{display:flex;align-items:center;flex-wrap:wrap;gap:4px}}#rfPanel .rf-study{{flex-basis:100%}}
#rfPanel select,#rfPanel input,#rfPanel button{{font:inherit;min-height:28px;max-width:100%}}#rfPanel input{{width:68px}}
#rfPanel .rf-study select{{flex:1;min-width:0}}#rfPanel [hidden]{{display:none!important}}
#rfStatus,#rfError{{flex-basis:100%}}#rfError{{color:#ffb99f}}#rfError:empty{{display:none}}
</style><script src="{url}"></script>
<!-- RADIOPHARMACEUTICAL_END -->'''
if '<!-- RADIOPHARMACEUTICAL_BEGIN -->' in s:
    s=re.sub(r'<!-- RADIOPHARMACEUTICAL_BEGIN -->.*?<!-- RADIOPHARMACEUTICAL_END -->',lambda _:block,s,flags=re.S)
else:s=s.replace('</body>',block+'\n</body>')
anchor='  function renderDetector(target, G){'
gate="\n    if(window.GANTRY_RF?.pending(acquisition.study))return window.GANTRY_RF.blank(target);"
if gate not in s:s=s.replace(anchor,anchor+gate,1)
anchor='  function effectiveCountRate(){'
gate="if(window.GANTRY_RF?.pending(acquisition.study))return 0;"
if anchor+gate not in s:s=s.replace(anchor,anchor+gate,1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Radiopharmaceutical panel embedded')

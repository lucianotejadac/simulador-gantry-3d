from pathlib import Path
import re,json
from externalize_assets import asset
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';html=p.read_text(encoding='utf-8')
data=json.loads((ROOT/'assets/physics/bone-case.json').read_text(encoding='utf-8'))
cellulitis=json.loads((ROOT/'assets/physics/cellulitis-case.json').read_text(encoding='utf-8'))
oncologic=json.loads((ROOT/'assets/physics/oncologic-case.json').read_text(encoding='utf-8'))
url=asset((ROOT/'scripts/patient_cases.js').read_bytes(),'patient-cases','js')
records=json.loads((ROOT/'assets/clinical/patient-records.json').read_text(encoding='utf-8'))
records_url=asset((ROOT/'scripts/patient_records.js').read_bytes(),'patient-records','js')
band_url=asset((ROOT/'scripts/patient_wristband.js').read_bytes(),'patient-wristband','js')
css_url=asset((ROOT/'scripts/patient_records.css').read_bytes(),'patient-records','css')
block='<!-- PATIENT_CASES_BEGIN -->\n<link rel="stylesheet" href="'+css_url+'">\n<script>window.GANTRY_BONE_CASE_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';window.GANTRY_CELLULITIS_CASE_DATA='+json.dumps(cellulitis,ensure_ascii=False,separators=(',',':'))+';window.GANTRY_ONCOLOGIC_CASE_DATA='+json.dumps(oncologic,ensure_ascii=False,separators=(',',':'))+';window.GANTRY_PATIENT_RECORD_DATA='+json.dumps(records,ensure_ascii=False,separators=(',',':'))+';</script>\n<script src="'+records_url+'"></script>\n<script src="'+band_url+'"></script>\n<script src="'+url+'"></script>\n<!-- PATIENT_CASES_END -->'
html=re.sub(r'<!-- PATIENT_CASES_BEGIN -->.*?<!-- PATIENT_CASES_END -->\n?', '',html,flags=re.S)
html=html.replace('</body>',block+'\n</body>')
p.write_text(html,encoding='utf-8',newline='\n')

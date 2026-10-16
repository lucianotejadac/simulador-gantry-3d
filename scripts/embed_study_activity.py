"""Install per-study activity controls; keep binary atlas resources unchanged."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
url=asset((ROOT/'scripts/study_activity.js').read_bytes(),'study-activity','js')
block=f'<!-- STUDY_ACTIVITY_BEGIN -->\n<script src="{url}"></script>\n<!-- STUDY_ACTIVITY_END -->\n'
if '<!-- STUDY_ACTIVITY_BEGIN -->' in s:s=re.sub(r'<!-- STUDY_ACTIVITY_BEGIN -->.*?<!-- STUDY_ACTIVITY_END -->\n',lambda _:block,s,flags=re.S)
else:s=s.replace('<!-- MDP_BEGIN -->',block+'<!-- MDP_BEGIN -->',1)
ui='''<!-- STUDY_ACTIVITY_UI_BEGIN -->
<style>#studyActivityControls[hidden],#studyActivityControls [hidden]{display:none!important}#studyActivityControls input{width:70px;background:#0e1820;color:#d6e6ef;border:1px solid #42586b;font:inherit;padding:3px}</style>
<div id="studyActivityControls" class="bone-signal-controls" hidden aria-label="Actividad administrada del estudio">
  <label><span id="studyActivityLabel">ACTIVIDAD INYECTADA</span>
    <input id="studyActivity" type="number" min="0.001" max="54.054" step="any" value="5" aria-label="Actividad administrada">
    <select id="studyActivityPreset" class="live-study" hidden aria-label="Actividad oral I-131"><option value="50">50</option><option value="100">100</option><option value="150">150</option><option value="200">200</option></select>
    <select id="studyActivityUnit" class="live-study" aria-label="Unidad de actividad del estudio"><option>mCi</option><option>MBq</option></select>
  </label><span id="studyActivityInfo"></span><span id="studyActivityNote" style="flex-basis:100%;font-size:9px;color:#a9bdce"></span>
</div>
<!-- STUDY_ACTIVITY_UI_END -->
'''
if '<!-- STUDY_ACTIVITY_UI_BEGIN -->' in s:s=re.sub(r'<!-- STUDY_ACTIVITY_UI_BEGIN -->.*?<!-- STUDY_ACTIVITY_UI_END -->\n',lambda _:ui,s,flags=re.S)
else:s=s.replace('<!-- MDP_UI_BEGIN -->',ui+'<!-- MDP_UI_BEGIN -->',1)
s=s.replace("function effectiveCountRate(){return acquisition.study==='mibi'", "function effectiveCountRate(){const activityRate=window.GANTRY_ACTIVITY?.rate(acquisition.study);if(activityRate!=null)return activityRate;return acquisition.study==='mibi'")
s=s.replace('    window.GANTRY_MIBI?.render();','    window.GANTRY_MIBI?.render();\n    window.GANTRY_ACTIVITY?.render();') if '    window.GANTRY_ACTIVITY?.render();' not in s else s
s=s.replace('function setCountRate(rate){', 'function setCountRate(rate){if(window.GANTRY_ACTIVITY?.metadata(acquisition.study))return;') if 'if(window.GANTRY_ACTIVITY?.metadata(acquisition.study))return;' not in s else s
s=s.replace("tracer:'I-131 · ICRP 145 · POSTRATAMIENTO · DÍA 5'", "tracer:'I-131 ORAL · ICRP 145 · POSTRATAMIENTO · DÍA 7'")
anchor='return {zoom:acquisition.zoom,matrix:acquisition.matrix,study:acquisition.study,'
if 'administeredActivity:window.GANTRY_ACTIVITY' not in s:s=s.replace(anchor,anchor+'\n              administeredActivity:window.GANTRY_ACTIVITY?.metadata(acquisition.study)||null,',1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Study activity controls embedded')

"""Install the external MIBI kinetics engine and its acquisition controls."""
from pathlib import Path
import json, re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
data = json.loads((ROOT / 'assets/icrp145/mibi-kinetic-provenance.json').read_text(encoding='utf-8'))
url = asset((ROOT / 'scripts/mibi_kinetics.js').read_bytes(), 'mibi-kinetics-engine', 'js')
block = '<!-- MIBI_KINETICS_BEGIN -->\n<script>window.GANTRY_MIBI_DATA=' + json.dumps(data, separators=(',', ':')) + ';</script>\n<script src="' + url + '"></script>\n<!-- MIBI_KINETICS_END -->\n'
if '<!-- MIBI_KINETICS_BEGIN -->' in s:
    s = re.sub(r'<!-- MIBI_KINETICS_BEGIN -->.*?<!-- MIBI_KINETICS_END -->\n', lambda _: block, s, flags=re.S)
else:
    s = s.replace('<!-- ICRP145_BEGIN -->', block + '<!-- ICRP145_BEGIN -->', 1)

ui = '''<!-- MIBI_KINETICS_UI_BEGIN -->
          <style>#mibiControls[hidden],#mibiPharmNote[hidden]{display:none!important}#mibiControls input[type=number]{background:#0e1820;color:#d6e6ef;border:1px solid #42586b;font:inherit;padding:3px}#mibiControls input[type=checkbox]{width:auto}#mibiTiming{flex-basis:100%;color:#98e6be}#mibiTiming[data-phase=early],#mibiTiming[data-phase=delayed]{color:#ffd288}#mibiTiming[data-phase=prolonged]{color:#ffb2a1}@media(min-width:901px){.gantry-live.bone-acquisition:has(#mibiControls:not([hidden])){height:clamp(440px,60vh,600px)}}</style>
          <div id="mibiControls" class="bone-signal-controls" hidden aria-label="Actividad y biodistribución del MIBI cardíaco">
            <label>ACTIVIDAD INYECTADA <input id="mibiActivity" type="number" min="0.1" max="2000" step="any" value="740" style="width:65px" aria-label="Actividad inyectada MIBI"><select id="mibiUnit" class="live-study" aria-label="Unidad MIBI"><option>MBq</option><option>mCi</option></select></label>
            <label>PROTOCOLO <select id="mibiProtocol" class="live-study" aria-label="Protocolo MIBI"><option value="rest">Reposo</option><option value="exercise">Ejercicio</option><option value="pharmacologic">Estrés farmacológico</option></select></label>
            <label>INYECCIÓN–EXAMEN <input id="mibiMinutes" type="number" min="0" max="720" step="any" value="60" style="width:65px" aria-label="Minutos desde inyección MIBI"> min</label>
            <input id="mibiTimeline" type="range" min="0" max="43200" step="1" value="3600" aria-label="Tiempo MIBI de 0 a 12 horas" style="width:150px">
            <button id="mibiUsual" class="live-setting" type="button">Tiempo de referencia</button>
            <button id="mibiLate" class="live-setting" type="button">Demora de 6 h</button>
            <button id="mibiPlay" class="live-setting" type="button">Reproducir evolución</button>
            <select id="mibiSpeed" class="live-study" aria-label="Velocidad de evolución MIBI"><option value="1">1×</option><option value="10">10×</option><option value="60" selected>60×</option><option value="300">300×</option><option value="600">600×</option></select>
            <label><input id="mibiVoid" type="checkbox" checked> Micción cada 2 h</label>
            <span id="mibiDose"></span><span id="mibiStats" style="flex-basis:100%"></span>
            <span id="mibiTiming"></span><span id="mibiPharmNote" hidden>Cinética farmacológica aproximada con curvas de reposo; espera orientativa propia.</span>
            <span style="font-size:9px;color:#a9bdce">Modelo docente de una inyección · sensibilidad LEHR supuesta: 100 c/s/MBq antes de atenuación · porcentajes de actividad inicial con decaimiento · curvas extrapoladas después de 4 h. El reloj avanza durante la adquisición. Los tiempos orientan; la actividad subdiafragmática puede requerir esperar más.</span>
          </div>
<!-- MIBI_KINETICS_UI_END -->
'''
if '<!-- MIBI_KINETICS_UI_BEGIN -->' in s:
    s = re.sub(r'<!-- MIBI_KINETICS_UI_BEGIN -->.*?<!-- MIBI_KINETICS_UI_END -->\n', lambda _: ui, s, flags=re.S)
else:
    s = s.replace('<!-- BONE_ACQ_UI_BEGIN -->', ui + '<!-- BONE_ACQ_UI_BEGIN -->', 1)

if 'target.mibiCache' not in s:
    patches = [
        ("function effectiveCountRate(){return ", "function effectiveCountRate(){return acquisition.study==='mibi'&&window.GANTRY_MIBI?window.GANTRY_MIBI.rate:"),
        ("    window.GANTRY_MDP?.render();", "    window.GANTRY_MDP?.render();\n    window.GANTRY_MIBI?.render();"),
        ("function setCountRate(rate){", "function setCountRate(rate){if(acquisition.study==='mibi'&&window.GANTRY_MIBI)return;"),
        ("const icrpPose=acquisition.study==='bone'", "const icrpPose=acquisition.study==='mibi'&&window.GANTRY_MIBI?window.GANTRY_MIBI.geometry():acquisition.study==='bone'"),
        ("      if(acquisition.study==='bone'&&window.GANTRY_MDP){\n        target.mdpCache", "      if(acquisition.study==='mibi'&&window.GANTRY_MIBI){\n        target.mibiCache ||= {};\n        target.linearField=window.GANTRY_MIBI.field(icrpPose,pair,crop,w,h,flipX,flipY,metrics,renderedBlur,target.mibiCache);\n        target.fieldKey=null;\n      }else if(acquisition.study==='bone'&&window.GANTRY_MDP){\n        target.mdpCache"),
    ]
    for old, new in patches:
        assert old in s, old
        s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8', newline='\n')
print('MIBI kinetics embedded')

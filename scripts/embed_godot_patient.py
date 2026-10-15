"""Install the optimized Godot patient in the web simulator."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
page = root / 'index.html'
html = page.read_text(encoding='utf-8')
meta = json.loads((root / 'assets/patient/manifest.json').read_text(encoding='utf-8'))
config = {'url': meta['url'], 'poses': meta['poses']}
html = re.sub(r'  const PATIENT_GLB = .*?;\n(?:  const PATIENT_DATA = .*?;\n)?',
              '  const PATIENT_GLB = '+json.dumps(meta['url'])+';\n  const PATIENT_DATA = '+json.dumps(config)+';\n', html)
start = html.index('  // Both fixed Godot poses') if '  // Both fixed Godot poses' in html else html.index("  let patientLoadState='loading';")
end = html.index('  /* ---------- estado y actualización ---------- */', start)
html = html[:start] + (root / 'scripts/godot_patient.js').read_text(encoding='utf-8').rstrip() + '\n\n' + html[end:]
# Only the selected pose participates in support and collision checks.
start = html.index('  function posedBounds(')
end = html.index("  let patientLoadState=", start)
html = html[:start] + html[start:end].replace('model.traverse(o=>{', 'model.traverseVisible(o=>{') + html[end:]
html = html.replace('setArms,getState:()=>st,equipment,physical:()=>({iso:', 'setArms,getState:()=>st,equipment,physical:(s=st)=>({iso:')
html = html.replace('length:BODY_L,bodyH,tail:PAL_TAIL_X', "length:BODY_L,bodyH:patientPoses.down?PATIENT_DATA.poses[s.arms==='up'?'up':'down'].height:bodyH,tail:PAL_TAIL_X")
if '    setArms(armsUp);\n    const prone' not in html:
    html = html.replace('    const prone = isProne();\n    flip.rotation.x', '    setArms(armsUp);\n    const prone = isProne();\n    flip.rotation.x')
html = html.replace('    setArms(armsUp);\n\n    const th', '    const th')
if '    const localPoint=node=>' in html:
    start = html.index('    const localPoint=node=>', html.index('  function patientPlacement()'))
    end = html.index('    return {', start)
    html = html[:start] + html[end:]
html = html.replace('      arms,\n      gapCm,', "      pose:st.arms,\n      model:'MakeHuman / SymbiaRoom Godot',\n      gapCm,")
html = html.replace('El paciente es el modelo «Man» de Quaternius', 'El paciente procede de MakeHuman / MPFB, usado en SymbiaRoom Godot')
html = html.replace('Modelo humano «Man» de Quaternius', 'Paciente MakeHuman / MPFB de SymbiaRoom Godot')
html = html.replace('Paciente: modelo «Man» de Quaternius (CC0 1.0) cargado como GLB', 'Paciente: MakeHuman / MPFB de SymbiaRoom Godot (CC0), dos posturas GLB')
page.write_text(html, encoding='utf-8', newline='\n')
print('Godot patient installed:', meta['url'])

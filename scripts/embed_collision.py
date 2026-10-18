"""Refresh the collision runtime and its self-contained controls."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'index.html'
html=page.read_text(encoding='utf-8')
css=(ROOT/'scripts/collision_shock.css').read_text(encoding='utf-8')
style='/* COLLISION_SHOCK_CSS_BEGIN */\n'+css+'\n/* COLLISION_SHOCK_CSS_END */'
if '/* COLLISION_SHOCK_CSS_BEGIN */' in html:
    html=re.sub(r'/\* COLLISION_SHOCK_CSS_BEGIN \*/.*?/\* COLLISION_SHOCK_CSS_END \*/',lambda _:style,html,flags=re.S)
else:
    html=html.replace('</style>\n</head>',style+'\n</style>\n</head>',1)
js=(ROOT/'scripts/gantry_collision.js').read_text(encoding='utf-8')
block='<!-- COLLISION_ENGINE_BEGIN -->\n<script>\n'+js+'\n</script>\n<!-- COLLISION_ENGINE_END -->'
if '<!-- COLLISION_ENGINE_BEGIN -->' in html:
    html=re.sub(r'<!-- COLLISION_ENGINE_BEGIN -->.*?<!-- COLLISION_ENGINE_END -->',lambda _:block,html,flags=re.S)
else:
    html=html.replace('<!-- SYMBIA_ROOM_BEGIN -->',block+'\n<!-- SYMBIA_ROOM_BEGIN -->',1)
if 'id="collisionD1"' not in html:
    panel='''<div id="collisionFeedback" style="position:absolute;left:8px;top:34px;max-width:42%;padding:5px 7px;background:#09131de6;border:1px solid #425468;color:#b9cddd;font:10px/1.5 var(--mono);pointer-events:none">
            <div id="collisionD1">D1 · Preparando colisiones…</div>
            <div id="collisionD2">D2 · Preparando colisiones…</div>
            <div id="collisionMessage" role="status" style="color:#dce7ef">Protección activa.</div>
          </div>
          '''
    html=html.replace('<div id="g3dMsg"',panel+'<div id="g3dMsg"',1)
if 'id="collisionMode"' not in html:
    controls='''<details id="collisionOptions" style="position:relative;font:11px var(--mono)">
            <summary style="cursor:pointer;padding:4px">Colisiones</summary>
            <div style="position:absolute;bottom:100%;left:0;width:320px;max-height:260px;overflow:auto;padding:10px;background:#11202c;border:1px solid #617e94;color:#e6eff6;z-index:40;box-shadow:0 3px 16px #0008">
              <label>Modo <select id="collisionMode" aria-label="Modo de colisiones"><option value="safe">Protección</option><option value="training">Entrenamiento: hasta 10 mm</option></select></label>
              <p>La penetración es geométrica; no calcula fuerza ni daño. La camilla siempre conserva su protección.</p>
              <label><input id="collisionSound" type="checkbox"> Alarma sonora</label>
              <details><summary>Registro de contactos (esta sesión)</summary><ol id="collisionLog" style="padding-left:18px;max-height:115px;overflow:auto"></ol></details>
            </div>
          </details>
          '''
    html=html.replace('<span class="hint" id="equipmentStatus" role="status"></span>', '<span class="hint" id="equipmentStatus" role="status"></span>\n          '+controls,1)
# Remove superseded global-width code, including unreachable return branches.
if '  const env = {N:360' in html:
    a=html.index('  /* ---------- envolvente real del paciente')
    b=html.index('  /* ---------- brazos del paciente',a)
    html=html[:a]+html[b:]
if '  function minRadius(' in html:
    a=html.index('  function minRadius(')
    b=html.index('  /* Distancia real',a)
    html=html[:a]+html[b:]
a=html.index('    /* Legacy global envelope retained below only as historical context. */') if '    /* Legacy global envelope' in html else -1
if a>=0:
    b=html.index('  function limitsFor(',a)
    html=html[:a]+'  }\n'+html[b:]
needle='    return collision.limits(Object.assign({},st,g||{}));'
a=html.index(needle)+len(needle)
b=html.index('  /* radio necesario',a)
html=html[:a]+'\n  }\n'+html[b:]
html=html.replace('    const lim = minRadius(theta, tableTop, prone, armsUp, zona);\n','')
html=html.replace('    return {r, gap:(r - lim.skin)*100, atLimit: distCm <= Math.ceil(lim.r*100)};', '    return {r, gap:Infinity, atLimit:false};')
# Repair a pre-existing duplicate credit inserted with a console encoding loss.
html=re.sub(r'Equipo visual derivado del modelo de planificaci\?n Siemens 13041;.*?</a>\. ', '',html,count=1)
html=html.replace('colores por v?rtice','colores por vértice')
html=html.replace('</details>\n          \n', '</details>\n\n')
page.write_text(html,encoding='utf-8',newline='\n')
print('Collision engine and controls refreshed.')

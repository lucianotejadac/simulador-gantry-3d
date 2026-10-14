"""Install initial blocking dialog before application scripts and controls."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'index.html'
html=page.read_text(encoding='utf-8')
css='''/* STARTUP_LOADING_CSS_BEGIN */
#startupLoading{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;padding:20px;box-sizing:border-box;border:0;background:#07111be8;color:#e5f3ff;z-index:2147483000}
#startupLoading[open]{display:grid;place-items:center}
#startupLoading::backdrop{background:#07111b99}
#startupLoading .startup-card{width:min(360px,90vw);box-sizing:border-box;text-align:center;padding:30px 25px;background:#15232f;border:1px solid #668399;border-radius:8px;box-shadow:0 20px 60px #0009;font:14px/1.5 system-ui,sans-serif}
#startupLoading h2{font-size:24px;margin:12px 0 6px;color:#fff}
#startupDetail{min-height:42px;margin:0 0 15px;color:#bcd0df}
#startupProgress{width:100%;height:8px;accent-color:#5bdaa9}
#startupSpinner{display:block;width:36px;height:36px;margin:0 auto;border:3px solid #344e62;border-top-color:#66e0b2;border-radius:50%;animation:startup-spin .9s linear infinite}
#startupLoading [hidden]{display:none!important}
#startupRetry{margin-top:12px;padding:9px 18px;border:1px solid #98b7ca;background:#d7e6ed;color:#14212b;border-radius:4px;cursor:pointer;font:600 14px system-ui,sans-serif}
@keyframes startup-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#startupSpinner{animation:none}}
/* STARTUP_LOADING_CSS_END */'''
if '/* STARTUP_LOADING_CSS_BEGIN */' in html:
    html=re.sub(r'/\* STARTUP_LOADING_CSS_BEGIN \*/.*?/\* STARTUP_LOADING_CSS_END \*/',lambda _:css,html,flags=re.S)
else:html=html.replace('</style>\n</head>',css+'\n</style>\n</head>',1)
js=(ROOT/'scripts/startup_loading.js').read_text(encoding='utf-8')
block='''<!-- STARTUP_LOADING_BEGIN -->
  <dialog id="startupLoading" open aria-modal="true" aria-labelledby="startupTitle" aria-describedby="startupDetail">
    <div class="startup-card">
      <span id="startupSpinner" aria-hidden="true"></span>
      <h2 id="startupTitle">Cargando…</h2>
      <p id="startupDetail" role="status">Preparando el simulador…</p>
      <progress id="startupProgress" max="5" value="0" aria-label="Carga inicial del simulador"></progress>
      <button id="startupRetry" type="button" hidden>Reintentar</button>
    </div>
  </dialog>
<script>
'''+js+'''</script>
<!-- STARTUP_LOADING_END -->'''
if '<!-- STARTUP_LOADING_BEGIN -->' in html:
    html=re.sub(r'<!-- STARTUP_LOADING_BEGIN -->.*?<!-- STARTUP_LOADING_END -->',lambda _:block,html,flags=re.S)
else:html=html.replace('<body>','<body>\n'+block,1)
html=html.replace('<div class="riswin" id="gantryWin">','<div class="riswin" id="gantryWin" inert aria-busy="true">',1)
if 'let patientLoadState=' not in html:
    html=html.replace('  new GLTFLoader().load(PATIENT_GLB, (gltf)=>{',"  let patientLoadState='loading';\n  new GLTFLoader().load(PATIENT_GLB, (gltf)=>{",1)
    html=html.replace('    }else apply(null);\n  }, undefined, ()=>{',"    }else apply(null);\n    patientLoadState='ready';\n  }, undefined, ()=>{\n    patientLoadState='error';",1)
    html=html.replace('surfaceGaps, room, equipment, collision};',"surfaceGaps, room, equipment, collision, get patientLoadState(){return patientLoadState;}};",1)
if 'get loadError(){return !!activeAtlas().error;}' not in html:
    html=html.replace('    get ready(){return ready;},', '    get ready(){return ready;},\n    get loadError(){return !!activeAtlas().error;},',1)
page.write_text(html,encoding='utf-8',newline='\n')
print('Startup loading dialog and readiness hooks installed.')

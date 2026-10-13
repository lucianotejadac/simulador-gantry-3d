"""Install/refresh the offline bone acquisition UI and engine."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')

css='''
/* BONE_ACQ_CSS_BEGIN */
.bone-card-title,.bone-acq-card{display:none}
.bone-acq-controls{display:flex;flex:none;gap:5px 9px;align-items:center;flex-wrap:wrap;padding:5px 9px;background:#14232d;color:#c5d7e5;font:10px var(--mono);border-bottom:1px solid #304251}
.bone-acq-controls[hidden],#boneAcqSetup[hidden],.bone-acq-controls button[hidden]{display:none}
.bone-acq-controls label{display:flex;gap:5px;align-items:center}
.bone-acq-controls input{width:100px;background:#0d151c;color:#d7e8f2;border:1px solid #42586b;padding:3px;font:inherit}
#boneAcqSetup input[type=text]{width:150px}#boneAcqSaved{max-width:300px;width:260px}
#boneAcqCacheStatus{color:#b7c9d9;font-size:9px}.bone-acquisition .bone-card-title{overflow:hidden;text-overflow:ellipsis}
#boneAcqSetup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-basis:100%;padding:4px 0}
#boneAcqSetupError{color:#ffc282}#boneAcqStatus{color:#8ee6bd}
#boneAcqPosition{color:#ffc282;flex-basis:100%}#boneAcqPosition:empty{display:none}
.gantry-live.bone-acquisition.bone-whole-body{height:clamp(570px,76vh,790px)}
.bone-whole-body .bone-acq-card canvas{object-fit:contain;aspect-ratio:1/3.5;max-height:100%;width:100%}
.bone-whole-body .live-card:not(.bone-acq-card) canvas{max-height:100%;width:100%;height:auto;object-fit:contain}
.gantry-live.bone-acquisition{height:clamp(355px,48vh,430px)}
.bone-acquisition .gantry-live-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.bone-acquisition .live-card{grid-template-columns:1fr;grid-template-rows:18px minmax(0,1fr) 35px}
.bone-acquisition .bone-acq-card{display:grid;grid-template-rows:18px minmax(0,1fr) 5px 30px}
.bone-acquisition .bone-card-title{display:block;font:700 10px var(--mono);color:#87dcc1;margin:3px 6px;white-space:nowrap}
.bone-acquisition .live-info{display:block;border-left:0;border-top:1px solid #273745;padding:3px 6px;font-size:9px;line-height:1.3}
.bone-acquisition .live-info b{font-size:9px;display:inline;margin-right:5px}
.bone-acq-card progress{height:5px;width:100%;accent-color:#53d990;align-self:center}
@media(max-width:900px){
 .gantry-live.bone-acquisition{height:clamp(460px,66vh,580px)}
 .bone-acquisition .gantry-live-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}
 .gantry-live.bone-acquisition.bone-whole-body{height:1040px}
 .bone-whole-body .gantry-live-grid{grid-template-rows:260px minmax(0,1fr)}
}
/* BONE_ACQ_CSS_END */
'''
if '/* BONE_ACQ_CSS_BEGIN */' in s:
    s=re.sub(r'/\* BONE_ACQ_CSS_BEGIN \*/.*?/\* BONE_ACQ_CSS_END \*/',lambda _:css.strip(),s,flags=re.S)
else:s=s.replace('</style>',css+'</style>',1)

toolbar='''<!-- BONE_ACQ_UI_BEGIN -->
          <div id="boneAcqControls" class="bone-acq-controls" hidden aria-label="Adquisición ósea">
            <label>Tipo <select id="boneAcqType" class="live-study" aria-label="Tipo de adquisición"><option value="static">Estática</option><option value="whole">Cuerpo entero</option></select></label>
            <button id="boneAcqStart" class="live-setting" type="button">Iniciar adquisición</button>
            <button id="boneAcqPause" class="live-setting" type="button" hidden>Pausar adquisición</button>
            <button id="boneAcqFinish" class="live-setting" type="button" hidden>Finalizar adquisición</button>
            <label>Avance rápido <select id="boneAcqSpeed" class="live-study" disabled><option value="1">1× (tiempo real)</option><option value="10">10×</option><option value="30">30×</option><option value="60">60×</option></select></label>
            <button id="boneAcqInstant" class="live-setting" type="button" hidden title="Completa lo que falta usando la posición y ajustes actuales">Adquisición instantánea</button>
            <button id="boneAcqSave" class="live-setting" type="button" disabled>Guardar adquisición</button>
            <label>Guardadas <select id="boneAcqSaved" class="live-study" aria-label="Adquisiciones guardadas"><option value="current">Adquisición actual</option></select></label>
            <span id="boneAcqCacheStatus" role="status" title="Se conserva en este navegador y sitio; borrar los datos del sitio elimina las adquisiciones guardadas."></span>
            <span id="boneAcqStatus" role="status">Preparando proyecciones óseas…</span>
            <span id="boneAcqPosition" role="status"></span>
            <form id="boneAcqSetup" hidden aria-label="Configurar adquisición ósea">
              <label>Nombre detector 1 <input id="boneAcqName1" type="text" maxlength="80" value="Detector 1" required></label>
              <label>Nombre detector 2 <input id="boneAcqName2" type="text" maxlength="80" value="Detector 2" required></label>
              <label>Terminar por <select id="boneAcqCriterion" class="live-study"><option value="counts">Cuentas objetivo</option><option value="time">Tiempo de adquisición</option></select></label>
              <label>Objetivo <input id="boneAcqTarget" type="number" min="1" max="10000000" step="1" value="100000" required></label>
              <span id="boneAcqUnits">cuentas por detector</span>
              <button id="boneAcqBegin" class="live-setting" type="submit">Comenzar</button><button id="boneAcqCancel" class="live-setting" type="button">Cancelar</button>
              <span id="boneAcqSetupError" role="alert"></span>
            </form>
          </div>
          <!-- BONE_ACQ_UI_END -->
'''
if '<!-- BONE_ACQ_UI_BEGIN -->' in s:
    s=re.sub(r'<!-- BONE_ACQ_UI_BEGIN -->.*?<!-- BONE_ACQ_UI_END -->\n',lambda _:toolbar,s,flags=re.S)
else:
    s=s.replace('          <div class="gantry-live-grid">',toolbar+'          <div class="gantry-live-grid">',1)
    for n in [1,2]:
        a=f'              <canvas id="liveD{n}"'
        assert a in s
        s=s.replace(a,f'              <h3 class="bone-card-title">EN VIVO · DETECTOR {n}</h3>\n'+a,1)
    a=s.index('          <div class="gantry-live-grid">')
    b=s.index('        </section>',a)
    insert=s.rfind('          </div>',a,b)
    cards=''
    for n in [1,2]:
        cards+=f'''            <div class="live-card bone-acq-card">
              <h3 class="bone-card-title" id="boneAcqTitle{n}">ADQUISICIÓN · DETECTOR {n}</h3>
              <canvas id="boneAcqD{n}" width="256" height="256" aria-label="Adquisición ósea detector {n}"></canvas>
              <progress id="boneAcqProgress{n}" value="0" max="1" aria-label="Progreso adquisición detector {n}"></progress>
              <div class="live-info" id="boneAcqInfo{n}">Esperando adquisición</div>
            </div>
'''
    s=s[:insert]+cards+s[insert:]

if 'window.GANTRY_BONE_ACQ?.advance();' not in s:
    s=s.replace('    if(window.GANTRY_MAG3)window.GANTRY_MAG3.stateChanged(G);','    window.GANTRY_BONE_ACQ?.advance();\n    if(window.GANTRY_MAG3)window.GANTRY_MAG3.stateChanged(G);',1)
    a="      panel.classList.add('ready');\n    }\n  }"
    assert a in s
    s=s.replace(a,"      panel.classList.add('ready');\n    }\n    window.GANTRY_BONE_ACQ?.sync(acquisition.study,targets.map(t=>ready?t.linearField:null),boneSignal.rate);\n  }",1)
    s=s.replace('  function setMatrix(matrix){','  function setMatrix(matrix){\n    if(acquisition.study===\'bone\' && window.GANTRY_BONE_ACQ?.active)return;',1)
    a="    acquisition.study=studies[study] ? study : 'thyroid';"
    s=s.replace(a,a+"\n    if(acquisition.study==='bone' && window.GANTRY_BONE_ACQ?.active)acquisition.matrix=window.GANTRY_BONE_ACQ.matrix;",1)
    a='    return meta;\n  }'
    assert a in s
    s=s.replace(a,"""    if(acquisition.study==='bone')target.info.innerHTML='<b>'+meta.view+'</b> '+meta.segment+'<br>'+(boneSignal.mode==='live'?meta.windowCounts.toLocaleString('es-CL')+' c / '+boneSignal.duration+' s':'Referencia sin ruido')+' · '+Math.round(meta.expectedRate).toLocaleString('es-CL')+' c/s';
    return meta;
  }""",1)

# Upgrade the compact live caption installed by the first packaging version.
s=s.replace("+'<br>'+meta.windowCounts.toLocaleString('es-CL')+' c / '+boneSignal.duration+' s · '+Math.round(meta.expectedRate)",
            "+'<br>'+(boneSignal.mode==='live'?meta.windowCounts.toLocaleString('es-CL')+' c / '+boneSignal.duration+' s':'Referencia sin ruido')+' · '+Math.round(meta.expectedRate)")
for n in [1,2]:
    s=s.replace(f'<h3 class="bone-card-title">ADQUISICIÓN · DETECTOR {n}</h3>',f'<h3 class="bone-card-title" id="boneAcqTitle{n}">ADQUISICIÓN · DETECTOR {n}</h3>')
engine='\n'.join((ROOT/'scripts'/name).read_text(encoding='utf-8') for name in ['bone_whole_body.js','bone_acquisition_store.js','bone_acquisition.js'])
block='<!-- BONE_ACQ_ENGINE_BEGIN -->\n<script>\n'+engine+'\n</script>\n<!-- BONE_ACQ_ENGINE_END -->'
if '<!-- BONE_ACQ_ENGINE_BEGIN -->' in s:
    s=re.sub(r'<!-- BONE_ACQ_ENGINE_BEGIN -->.*?<!-- BONE_ACQ_ENGINE_END -->',lambda _:block,s,flags=re.S)
else:s=s.replace('</body>',block+'\n</body>',1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Bone acquisition embedded')

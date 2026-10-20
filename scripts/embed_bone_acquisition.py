"""Install/refresh the offline bone acquisition UI and engine."""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')

css='''
/* BONE_ACQ_CSS_BEGIN */
#gantryWin>.ris-title{display:none}
#gantryWorkspace{height:calc(100% - 28px)!important}
#gantryRemote{width:190px!important}
#gantryRemote #mando{max-width:155px}
.bone-card-title,.bone-acq-card{display:none}
.bone-acq-controls{display:flex;flex:none;gap:5px 9px;align-items:center;flex-wrap:wrap;padding:5px 9px;background:#14232d;color:#c5d7e5;font:10px var(--mono);border-bottom:1px solid #304251}
.bone-acq-controls[hidden],#boneAcqSetup[hidden],.bone-acq-controls button[hidden]{display:none}
.bone-acq-controls [hidden]{display:none!important}
.bone-acq-controls label{display:flex;gap:5px;align-items:center}
.bone-acq-controls input{width:100px;background:#0d151c;color:#d7e8f2;border:1px solid #42586b;padding:3px;font:inherit}
#boneAcqSetup input[type=text]{width:150px}#boneAcqSaved{max-width:300px;width:260px}
#boneAcqCacheStatus{color:#b7c9d9;font-size:9px}.bone-acquisition .bone-card-title{overflow:hidden;text-overflow:ellipsis}
#boneAcqSetup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-basis:100%;padding:4px 0}
#boneAcqSetupError{color:#ffc282}#boneAcqStatus{color:#8ee6bd}
#boneAcqPosition{color:#ffc282;flex-basis:100%}#boneAcqPosition:empty{display:none}
.bone-whole-body .bone-acq-card canvas{object-fit:contain;aspect-ratio:1/3.5;max-height:100%;width:100%}
.bone-whole-body .live-card:not(.bone-acq-card) canvas{max-height:100%;width:100%;height:auto;object-fit:contain}
.gantry-live.bone-acquisition{height:clamp(355px,48vh,430px)}
.bone-acquisition .gantry-live-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.bone-acquisition .live-card{grid-template-columns:1fr;grid-template-rows:18px minmax(0,1fr) 62px}
.bone-acquisition .bone-acq-card{display:grid;grid-template-rows:18px minmax(0,1fr) 5px 55px}
.bone-acquisition .bone-card-title{display:block;font:700 10px var(--mono);color:#87dcc1;margin:3px 6px;white-space:nowrap}
.bone-acquisition .live-info{display:block;border-left:0;border-top:1px solid #273745;padding:3px 6px;font-size:9px;line-height:1.3;white-space:pre-line}
.bone-acquisition .live-info b{font-size:9px;display:inline;margin-right:5px}
.bone-acq-card progress{height:5px;width:100%;accent-color:#53d990;align-self:center}
@media(min-width:901px){
 #gantryWorkArea:has(> .bone-whole-body){display:grid!important;grid-template-columns:minmax(0,28fr) minmax(0,28fr) minmax(0,22fr) minmax(0,22fr);grid-template-rows:minmax(180px,1fr) auto auto auto minmax(140px,25vh) auto;gap:6px!important;min-height:0;overflow:auto}
 #gantryWorkArea:has(> .bone-whole-body)>#g3dStage{grid-column:1/3;grid-row:1;min-height:180px!important}
 .gantry-live.bone-acquisition.bone-whole-body,.bone-whole-body .gantry-live-grid{display:contents}
 .bone-whole-body .gantry-live-head{grid-column:1/3;grid-row:2}
 .bone-whole-body .bone-signal-controls{grid-column:1/3;grid-row:3}
 .bone-whole-body .bone-acq-controls{grid-column:1/3;grid-row:4}
 .bone-whole-body .gantry-live-grid>.live-card:nth-child(1){grid-column:1;grid-row:5}
 .bone-whole-body .gantry-live-grid>.live-card:nth-child(2){grid-column:2;grid-row:5}
 .bone-whole-body .gantry-live-grid>.bone-acq-card:nth-child(3){grid-column:3;grid-row:1/7}
 .bone-whole-body .gantry-live-grid>.bone-acq-card:nth-child(4){grid-column:4;grid-row:1/7}
 #gantryWorkArea:has(> .bone-whole-body)>.gantry-live+div{grid-column:1/3;grid-row:6}
 .bone-whole-body .bone-acq-card .bone-card-title{white-space:normal;line-height:1.3;margin:5px 6px}
 .bone-whole-body .bone-acq-card{grid-template-rows:minmax(32px,auto) minmax(0,1fr) 5px 42px}
 .bone-whole-body .bone-acq-card canvas{min-height:0;height:100%;width:100%}
 .bone-whole-body .bone-acq-controls #boneAcqSaved{width:200px;max-width:100%}
}
@media(max-width:900px){
 .gantry-live.bone-acquisition{height:clamp(460px,66vh,580px)}
 .bone-acquisition .gantry-live-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}
 .gantry-live.bone-acquisition.bone-whole-body{height:1040px}
 #gantryWorkArea:has(> .bone-whole-body){overflow-y:auto;min-height:0}
 #gantryWorkArea:has(> .bone-whole-body)>#g3dStage{min-height:220px;flex-shrink:0}
 .bone-whole-body .gantry-live-grid{grid-template-rows:260px minmax(0,1fr)}
}
/* BONE_ACQ_CSS_END */
'''
# Stable layout hooks; retain the original elements, canvas contexts and handlers.
for old,new in [
    ('<div style="display:flex;gap:14px;padding:12px;height:calc(100% - 52px);', '<div id="gantryWorkspace" style="display:flex;gap:14px;padding:12px;height:calc(100% - 52px);'),
    ('<div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0">', '<div id="gantryWorkArea" style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0">'),
    ('<div style="width:252px;flex:none;display:flex;flex-direction:column;gap:9px;overflow:auto">', '<div id="gantryRemote" style="width:252px;flex:none;display:flex;flex-direction:column;gap:9px;overflow:auto">'),
]:
    if old in s:s=s.replace(old,new,1)
if '/* BONE_ACQ_CSS_BEGIN */' in s:
    s=re.sub(r'/\* BONE_ACQ_CSS_BEGIN \*/.*?/\* BONE_ACQ_CSS_END \*/',lambda _:css.strip(),s,flags=re.S)
else:s=s.replace('</style>',css+'</style>',1)

toolbar='''<!-- BONE_ACQ_UI_BEGIN -->
          <div id="boneAcqControls" class="bone-acq-controls" hidden aria-label="Adquisición de detectores">
            <label id="boneAcqTypeWrap">Tipo <select id="boneAcqType" class="live-study" aria-label="Tipo de adquisición"><option value="static">Estática</option><option value="whole">Cuerpo entero</option></select></label>
            <button id="boneAcqStart" class="live-setting" type="button">Iniciar adquisición</button>
            <button id="boneAcqInstant" class="live-setting" type="button" title="Inicia con los nombres y ajustes actuales y completa la adquisición, o termina la que está en curso">Adquisición instantánea</button>
            <button id="boneAcqPause" class="live-setting" type="button" hidden>Pausar adquisición</button>
            <button id="boneAcqFinish" class="live-setting" type="button" hidden>Finalizar adquisición</button>
            <span id="boneAcqSpeedWrap"><button id="boneAcqFast" class="live-setting" type="button" disabled title="Alterna 1×, 10×, 30× y 60×">⏩ Avance rápido · 1×</button> <select id="boneAcqSpeed" class="live-study" aria-label="Velocidad de simulación" disabled><option value="1">1× (tiempo real)</option><option value="10">10×</option><option value="30">30×</option><option value="60">60×</option></select></span>
            <button id="boneAcqSave" class="live-setting" type="button" disabled>Guardar adquisición</button>
            <button id="boneSendProcessing" class="live-setting" type="button">Enviar a procesamiento</button>
            <label>Guardadas <select id="boneAcqSaved" class="live-study" aria-label="Adquisiciones guardadas"><option value="current">Adquisición actual</option></select></label>
            <span id="boneAcqCacheStatus" role="status" title="Se conserva en este navegador y sitio; borrar los datos del sitio elimina las adquisiciones guardadas."></span>
            <span id="boneAcqStatus" role="status">Preparando proyecciones…</span>
            <span id="boneAcqPosition" role="status"></span>
            <form id="boneAcqSetup" hidden aria-label="Configurar adquisición">
              <label>Nombre detector 1 <input id="boneAcqName1" type="text" maxlength="80" value="Detector 1" required></label>
              <label>Nombre detector 2 <input id="boneAcqName2" type="text" maxlength="80" value="Detector 2" required></label>
              <label id="boneAcqVelocityWrap" hidden>Velocidad de camilla <input id="boneAcqVelocity" type="number" min="0.1" max="60" step="0.025" value="10" required disabled> cm/min</label>
              <label id="boneAcqContoursWrap" hidden>Contornos automáticos <select id="boneAcqContours" class="live-study"><option value="auto">Activados</option><option value="fixed">Desactivados · distancia fija</option></select></label>
              <label id="boneAcqCriterionWrap">Terminar por <select id="boneAcqCriterion" class="live-study"><option value="counts">Cuentas totales objetivo</option><option value="time">Tiempo de adquisición</option></select></label>
              <label id="boneAcqTargetWrap">Objetivo <input id="boneAcqTarget" type="number" min="1" max="10000000" step="1" value="100000" required></label>
              <span id="boneAcqUnits">cuentas totales por detector</span>
              <button id="boneAcqSuggested" class="live-setting" type="button" hidden>Usar objetivo sugerido</button>
              <button id="boneAcqBegin" class="live-setting" type="submit">Comenzar</button><button id="boneAcqCancel" class="live-setting" type="button">Cancelar</button>
              <span id="boneAcqEstimate" role="status" style="flex-basis:100%;color:#9ee7c9"></span>
            </form>
            <span id="boneAcqSetupError" role="alert"></span>
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
# Keep keyboard/held remote movement from competing with the automatic scan.
guard="    if(window.GANTRY_BONE_ACQ?.scanning)return false;"
if guard not in s:
    s=s.replace('  function step(g,d){','  function step(g,d){\n'+guard,1)
block='<!-- BONE_ACQ_ENGINE_BEGIN -->\n<script>\n'+engine+'\n</script>\n<!-- BONE_ACQ_ENGINE_END -->'
if '<!-- BONE_ACQ_ENGINE_BEGIN -->' in s:
    s=re.sub(r'<!-- BONE_ACQ_ENGINE_BEGIN -->.*?<!-- BONE_ACQ_ENGINE_END -->',lambda _:block,s,flags=re.S)
else:s=s.replace('</body>',block+'\n</body>',1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Bone acquisition embedded')

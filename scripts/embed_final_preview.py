"""Install a cached, external final-image preview engine."""
from pathlib import Path
import re
from externalize_assets import asset
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
url=asset((ROOT/'scripts/final_preview.js').read_bytes(),'final-preview','js')
block='<!-- FINAL_PREVIEW_BEGIN -->\n<script src="'+url+'"></script>\n<!-- FINAL_PREVIEW_END -->\n'
if '<!-- FINAL_PREVIEW_BEGIN -->' in s:s=re.sub(r'<!-- FINAL_PREVIEW_BEGIN -->.*?<!-- FINAL_PREVIEW_END -->\n',lambda _:block,s,flags=re.S)
else:s=s.replace('<!-- ICRP145_BEGIN -->',block+'<!-- ICRP145_BEGIN -->',1)
ui='''<!-- FINAL_PREVIEW_UI_BEGIN -->
          <style>
          #finalPreviewControls[hidden]{display:none!important}#finalPreviewControls input{width:90px;background:#0e1820;color:#d6e6ef;border:1px solid #42586b;font:inherit;padding:3px}
          #gantryLive.final-preview .bone-acq-card,#gantryLive.final-preview #boneAcqControls{display:none!important}
          #gantryLive.final-preview label:has(#bonePersistence),#gantryLive.final-preview #bonePause,#gantryLive.final-preview #boneClear{display:none!important}
          #gantryLive.final-preview #boneSignalMode{width:280px;max-width:100%}
          #gantryLive.final-preview .gantry-live-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}
          #gantryLive.final-preview .live-card{grid-template-columns:1fr;grid-template-rows:20px minmax(0,1fr) 40px}
          #gantryLive.final-preview .bone-card-title{display:block}
          #gantryLive.final-preview .live-info{display:block;font-size:10px}
          #gantryLive.final-preview{height:clamp(440px,62vh,620px)}
          #finalPreviewStatus{color:#9ee7c9}
          </style>
          <div id="finalPreviewControls" class="bone-signal-controls" hidden aria-label="Imagen final con las condiciones actuales">
            <label>PREVER POR <select id="finalPreviewCriterion" class="live-study"><option value="time">Tiempo de adquisición</option><option value="counts">Número de cuentas</option></select></label>
            <label>OBJETIVO <input id="finalPreviewTarget" type="number" min="1" max="3600" step="1" value="60" aria-label="Objetivo de imagen final"></label>
            <span id="finalPreviewUnits">segundos por detector</span>
            <button id="finalPreviewNoise" class="live-setting" type="button">Nueva muestra de ruido</button>
            <span id="finalPreviewStatus" role="status"></span>
          </div>
<!-- FINAL_PREVIEW_UI_END -->
'''
if '<!-- FINAL_PREVIEW_UI_BEGIN -->' in s:s=re.sub(r'<!-- FINAL_PREVIEW_UI_BEGIN -->.*?<!-- FINAL_PREVIEW_UI_END -->\n',lambda _:ui,s,flags=re.S)
else:s=s.replace('<!-- BONE_ACQ_UI_BEGIN -->',ui+'<!-- BONE_ACQ_UI_BEGIN -->',1)
if 'value="final"' not in s:
    s=s.replace('<option value="reference">Sin ruido</option>','<option value="reference">Sin ruido</option><option value="final">Imagen final con condiciones actuales</option>',1)
if 'id="liveDisplayMode"' not in s:
    s=s.replace('<span>IMAGEN EN VIVO &middot;', '<span><span id="liveDisplayMode">IMAGEN EN VIVO</span> &middot;',1)
if 'GANTRY_FINAL_PREVIEW?.sync' not in s:
    patches=[
      ("  function setSignalMode(mode){boneSignal.mode=mode==='reference'?'reference':'live';clearPersistence();refreshBone();}","""  function setSignalMode(mode){
    if(mode==='final'){
      if(window.GANTRY_BONE_ACQ?.pauseForPreview()===false){boneControls.mode.value=boneSignal.mode;return;}
      if(acquisition.study==='bone')window.GANTRY_MDP?.begin();
      if(acquisition.study==='mibi')window.GANTRY_MIBI?.begin();
    }
    boneSignal.mode=['reference','final'].includes(mode)?mode:'live';clearPersistence();refreshBone();
  }"""),
      ("    boneControls.status.textContent=boneSignal.mode==='reference'?", "    boneControls.rate.disabled=boneSignal.mode==='reference';\n    const finalOption=boneControls.mode.querySelector('option[value=final]');if(finalOption)finalOption.disabled=!!window.GANTRY_BONE_ACQ?.scanning;\n    window.GANTRY_FINAL_PREVIEW?.controls();\n    boneControls.status.textContent=boneSignal.mode==='final'?'Imagen final prevista':boneSignal.mode==='reference'?"),
      ("    window.GANTRY_BONE_ACQ?.sync(acquisition.study,targets.map(t=>ready?t.linearField:null),effectiveCountRate());", "    window.GANTRY_BONE_ACQ?.sync(acquisition.study,targets.map(t=>ready?t.linearField:null),effectiveCountRate());\n    window.GANTRY_FINAL_PREVIEW?.sync(acquisition.study,targets,effectiveCountRate(),lastRender);"),
    ]
    for old,new in patches:
        assert old in s,old
        s=s.replace(old,new,1)
# Live geometry/field calculations continue offscreen while final images remain
# visible. Even resizing a canvas to the same dimensions clears its contents.
if 'const preview=window.GANTRY_FINAL_PREVIEW?.active;' not in s:
    old='    const output=target.canvas;'
    new='''    const preview=window.GANTRY_FINAL_PREVIEW?.active;
    const output=preview?(target.previewBuffer ||= document.createElement('canvas')):target.canvas;
    if(preview){
      if(output.width!==target.canvas.width)output.width=target.canvas.width;
      if(output.height!==target.canvas.height)output.height=target.canvas.height;
    }'''
    assert old in s;s=s.replace(old,new,1)
    s=s.replace("    target.info.innerHTML='<b>DETECTOR '+target.n", "    if(!preview)target.info.innerHTML='<b>DETECTOR '+target.n",1)
    s=s.replace("    if(activeStudy().linear&&acquisition.study!=='mag3')target.info.innerHTML=", "    if(!preview&&activeStudy().linear&&acquisition.study!=='mag3')target.info.innerHTML=",1)
p.write_text(s,encoding='utf-8',newline='\n')
print('Final-image preview embedded')

"""Install/refresh the MDP model without embedding binary atlases in HTML."""
from pathlib import Path
import json, re
from externalize_assets import asset

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
data=json.loads((ROOT/'assets/icrp145/mdp-provenance.json').read_text(encoding='utf-8'))
# Keep audit statistics in provenance, not the synchronous HTML shell.
for pose in data['poses'].values():
    if 'nativeBone' in pose:
        for key in ('viewSums','angles','emissionModel'):
            pose['nativeBone'].pop(key,None)
url=asset((ROOT/'scripts/mdp.js').read_bytes(),'mdp-engine','js')
block='<!-- MDP_BEGIN -->\n<script>window.GANTRY_MDP_DATA='+json.dumps(data,separators=(',',':'))+';</script>\n<script src="'+url+'"></script>\n<!-- MDP_END -->\n'
if '<!-- MDP_BEGIN -->' in s:s=re.sub(r'<!-- MDP_BEGIN -->.*?<!-- MDP_END -->\n',lambda _:block,s,flags=re.S)
else:s=s.replace('<!-- ICRP145_BEGIN -->',block+'<!-- ICRP145_BEGIN -->',1)
ui='''<!-- MDP_UI_BEGIN -->
          <style>.bone-signal-controls label[hidden],#mdpControls[hidden]{display:none!important}#mdpControls input[type=number]{background:#0e1820;color:#d6e6ef;border:1px solid #42586b;font:inherit;padding:3px}#mdpControls input[type=checkbox]{width:auto}</style>
          <div id="mdpControls" class="bone-signal-controls" hidden aria-label="Actividad y biodistribución del MDP">
            <label>ACTIVIDAD INYECTADA <input id="mdpActivity" type="number" min="0.1" max="54.054054" step="any" value="20" style="width:65px" aria-label="Actividad inyectada MDP"><select id="mdpUnit" class="live-study" aria-label="Unidad de actividad"><option>mCi</option><option>MBq</option></select></label>
            <label>INYECCIÓN–EXAMEN <input id="mdpMinutes" type="number" min="0" max="180" step="any" value="120" style="width:65px" aria-label="Minutos desde inyección"> min</label>
            <input id="mdpTimeline" type="range" min="0" max="10800" step="1" value="7200" aria-label="Tiempo MDP de 0 a 180 minutos" style="width:150px">
            <button id="mdpPlay" class="live-setting" type="button">Reproducir 0–3 h</button>
            <select id="mdpSpeed" class="live-study" aria-label="Velocidad de evolución MDP"><option value="1">1×</option><option value="10">10×</option><option value="60" selected>60×</option><option value="300">300×</option></select>
            <label><input id="mdpVoid" type="checkbox" checked> Micción a 120 min</label>
            <span id="mdpDose"></span><span id="mdpStats" style="flex-basis:100%"></span>
            <span style="font-size:9px;color:#a9bdce">Cinética docente · sensibilidad LEHR supuesta: 100 c/s/MBq antes de atenuación · porcentajes de actividad inicial, con decaimiento. Al adquirir, el reloj avanza con la adquisición hasta 180 min.</span>
          </div>
<!-- MDP_UI_END -->
'''
if '<!-- MDP_UI_BEGIN -->' in s:s=re.sub(r'<!-- MDP_UI_BEGIN -->.*?<!-- MDP_UI_END -->\n',lambda _:ui,s,flags=re.S)
else:s=s.replace('<!-- BONE_ACQ_UI_BEGIN -->',ui+'<!-- BONE_ACQ_UI_BEGIN -->',1)
if 'function effectiveCountRate()' not in s:
    s=s.replace('  function syncBoneControls(){',"  function effectiveCountRate(){return acquisition.study==='bone'&&window.GANTRY_MDP?window.GANTRY_MDP.rate:boneSignal.rate;}\n  function syncBoneControls(){\n    window.GANTRY_MDP?.render();",1)
    s=s.replace("function setCountRate(rate){", "function setCountRate(rate){if(acquisition.study==='bone'&&window.GANTRY_MDP)return;",1)
    old="const icrpPose=activeStudy().linear&&acquisition.study!=='mag3' ? window.GANTRY_ICRP.poses[activeStudy().atlasKey||(G.arms==='up'?'up':'down')] : null;"
    new="const icrpPose=acquisition.study==='bone'&&window.GANTRY_MDP?window.GANTRY_MDP.geometry(G.arms==='up'?'up':'down'):activeStudy().linear&&acquisition.study!=='mag3' ? window.GANTRY_ICRP.poses[activeStudy().atlasKey||(G.arms==='up'?'up':'down')] : null;"
    assert old in s;s=s.replace(old,new,1)
    old='      if(target.fieldKey!==key){'
    new="""      if(acquisition.study==='bone'&&window.GANTRY_MDP){
        target.mdpCache ||= {};
        target.linearField=window.GANTRY_MDP.field(icrpPose,pair,crop,w,h,flipX,flipY,metrics,renderedBlur,G.arms==='up'?'up':'down',target.mdpCache);
        target.fieldKey=null;
      }else if(target.fieldKey!==key){"""
    assert old in s;s=s.replace(old,new,1)
    s=s.replace('target.persistence.step(target.linearField,boneSignal.rate,','target.persistence.step(target.linearField,effectiveCountRate(),')
    s=s.replace('target.persistence.draw(ctx,target.linearField,boneSignal.rate,','target.persistence.draw(ctx,target.linearField,effectiveCountRate(),')
    s=s.replace('expectedRate:target.linearField.sum/2000000*boneSignal.rate','expectedRate:target.linearField.sum/2000000*effectiveCountRate()')
    s=s.replace('targets.map(t=>ready?t.linearField:null),boneSignal.rate','targets.map(t=>ready?t.linearField:null),effectiveCountRate()')
    s=s.replace('get signal(){return {...boneSignal,step:undefined};}', 'get signal(){return {...boneSignal,rate:effectiveCountRate(),step:undefined};}')
p.write_text(s,encoding='utf-8',newline='\n')
print('MDP embedded')

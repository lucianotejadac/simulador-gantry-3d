"""Refresh the live UI integration for all existing static 360 studies."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
if '// STATIC_STUDIES_ENABLED' not in s:
    for study in ['thyroid','exploration','parathyroid']:
        anchor=f"      id:'{study}',label:"
        assert anchor in s
        s=s.replace(anchor,f"      atlasKey:'{study}',linear:true,angles:window.GANTRY_ICRP_DATA.{study}.angles,\n"+anchor,1)
    s=s.replace("      id:'mibi',label:","      atlasKey:'mibi_up',\n      id:'mibi',label:",1)
    start=s.index("    const icrpPose=acquisition.study==='mibi'")
    end=s.index('    const sourceWidth=',start)
    s=s[:start]+"    const icrpPose=activeStudy().linear&&acquisition.study!=='mag3' ? window.GANTRY_ICRP.poses[activeStudy().atlasKey||(G.arms==='up'?'up':'down')] : null;\n"+s[end:]
    s=s.replace('(560/3)/magnification','(560/(icrpPose.pixelMm||3))/magnification',1)
    s=s.replace('icrpPose ? 10/3 : FRAME_W/ATLAS_TRANSVERSE_CM','icrpPose ? (icrpPose.transversePxPerCm||10/3) : FRAME_W/ATLAS_TRANSVERSE_CM',1)
    s=s.replace("source:'ICRP 145 · postura '+(G.arms==='up'?'articulada':'original')", "source:icrpPose.source||('ICRP 145 · postura '+(G.arms==='up'?'articulada':'original'))",1)
    s=s.replace("if(acquisition.study==='bone')target.info.innerHTML=", "if(activeStudy().linear&&acquisition.study!=='mag3')target.info.innerHTML=",1)
    s=s.replace("if(acquisition.study==='bone' && window.GANTRY_BONE_ACQ?.active)","if(acquisition.study!=='mag3' && window.GANTRY_BONE_ACQ?.active)")
    anchor="    acquisition.study=studies[study] ? study : 'thyroid';"
    assert anchor in s
    s=s.replace(anchor,"    // STATIC_STUDIES_ENABLED\n    const nextStudy=studies[study]?study:'thyroid';\n    if(window.GANTRY_BONE_ACQ?.selectStudy(nextStudy)===false){if(controls.study)controls.study.value=acquisition.study;return;}\n    acquisition.study=nextStudy;",1)
    s=s.replace('aria-label="Adquisición ósea detector','aria-label="Adquisición detector')
if '// STATIC_POSTURES_ENABLED' not in s:
    anchor="    const fixedArms=acquisition.study==='mibi';"
    s=s.replace(anchor,anchor+"\n    // STATIC_POSTURES_ENABLED\n    const fixedDown=['thyroid','exploration','parathyroid'].includes(acquisition.study);\n    const upButton=document.querySelector('[data-arms=\"up\"]');\n    upButton.disabled=fixedDown;upButton.title=fixedDown?'Este atlas corresponde a brazos al costado':'';",1)
    anchor="    const selected=activeStudy();\n    if(acquisition.study==='mibi'"
    replacement="    const selected=activeStudy();\n    if(['thyroid','exploration','parathyroid'].includes(acquisition.study)&&window.GANTRY){\n      window.GANTRY.G.arms='down';if(lastState)lastState.arms='down';window.GANTRY.render();\n    }\n    if(acquisition.study==='mibi'"
    assert anchor in s
    s=s.replace(anchor,replacement,1)
for name, label, tracer in [('dmsa','DMSA renal','99mTc-DMSA · 3 H'), ('maa','MAA pulmonar','99mTc-MAA · 5 MIN')]:
    if f"    {name}:{{" not in s:
        definition = f"""    {name}:{{
      atlasKey:'{name}',id:'{name}',label:'{label}',tracer:'{tracer}',
      energy:'low',photopeak:140,energyRange:[80,450],energyResolution:.10,
      scatterBase:.10,recommendedCollimator:'LEHR',
      angles:window.GANTRY_ICRP_DATA.{name}.angles,
      linear:true,ready:false,error:false
    }},
"""
        s=s.replace("    mag3:{id:'mag3'",definition+"    mag3:{id:'mag3'",1)
    if f'<option value="{name}">' not in s:
        s=s.replace('<option value="parathyroid">',f'<option value="{name}">{label}</option>\n                <option value="parathyroid">',1)
s=s.replace("['thyroid','exploration','parathyroid'].includes(acquisition.study)",
            "['thyroid','exploration','parathyroid','dmsa','maa'].includes(acquisition.study)")
# Replace each legacy image-backed descriptor, including its obsolete angle list.
for name, label, tracer, peak, scatter, collimator in [
    ('thyroid','Cintigrama tiroideo','99mTc-PERTECNETATO · ICRP 145 · 20 MIN',140,.10,'LEHR'),
    ('exploration','I-131 postratamiento','I-131 · ICRP 145 · POSTRATAMIENTO · DÍA 5',364,.30,'HE'),
    ('parathyroid','Paratiroides','99mTc-MIBI · ICRP 145 · PARATIROIDES · 60 MIN · SIN ADENOMA',140,.10,'LEHR')]:
    descriptor = f"""    {name}:{{
      atlasKey:'{name}',linear:true,angles:window.GANTRY_ICRP_DATA.{name}.angles,
      id:'{name}',label:'{label}',tracer:'{tracer}',
      energy:'{'high' if peak==364 else 'low'}',photopeak:{peak},energyRange:[80,450],energyResolution:.10,
      scatterBase:{scatter},recommendedCollimator:'{collimator}',ready:false,error:false
    }},"""
    s,count=re.subn(r'    '+name+r':\{.*?\n    \},',lambda _:descriptor,s,count=1,flags=re.S)
    assert count == 1, name
s=s.replace('<option value="exploration">Exploraci&oacute;n</option>',
            '<option value="exploration">I-131 postratamiento</option>')
# Old PNG declarations have no runtime consumer after the organ migration.
s=re.sub(r'window\.GANTRY_LIVE_ATLAS(?:_EXPLORACION|_PARATIROIDES)?=.*?;\n','',s)
p.write_text(s,encoding='utf-8',newline='\n')

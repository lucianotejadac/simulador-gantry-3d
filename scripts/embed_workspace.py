"""Package the workspace layout independently of study/acquisition builders."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
# Keep the existing canvas IDs and elements: only their layout parent changes.
if 'id="gantryLiveMonitors"' not in html:
    cards=[]
    for n in (1,2):
        pattern=rf'<div class="live-card">\s*<h3 class="bone-card-title">[^<]*</h3>\s*<canvas id="liveD{n}"[^>]*></canvas>\s*<div class="live-info" id="liveInfoD{n}">.*?</div>\s*</div>'
        match=re.search(pattern,html,re.S)
        assert match, f'Live detector {n} card missing'
        cards.append(match.group())
        html=html[:match.start()]+html[match.end():]
    html=html.replace('<span id="liveDisplayMode">IMAGEN EN VIVO</span>','<span>CONTROLES Y ADQUISICIÓN</span>',1)
    monitors='<section id="gantryLiveMonitors" aria-label="Pantallas de los detectores">\n<header class="live-monitor-title"><span class="live-dot" aria-hidden="true"></span><span id="liveDisplayMode">IMAGEN EN VIVO</span></header>\n<div class="live-monitor-grid">'+''.join(cards)+'</div>\n</section>\n'
    html=html.replace('<section class="gantry-live" id="gantryLive"',monitors+'<section class="gantry-live" id="gantryLive"',1)
html=html.replace('id="gantryLive" aria-label="Imagen en vivo de los detectores"','id="gantryLive" aria-label="Controles y adquisiciones"',1)
if 'id="liveCameraSettings"' not in html:
    anchor='<span id="liveDisplayMode">IMAGEN EN VIVO</span></header>'
    assert anchor in html
    html=html.replace(anchor,anchor+'\n<div id="liveCameraSettings" aria-label="Parámetros activos de la vista en vivo"></div>',1)
if 'const liveCameraSettings=' not in html:
    anchor='  function syncBoneControls(){'
    assert anchor in html
    html=html.replace(anchor,anchor+'''
    const liveCameraSettings=document.getElementById('liveCameraSettings');
    if(liveCameraSettings)liveCameraSettings.textContent=acquisition.matrix+' × '+acquisition.matrix+' · Zoom '+acquisition.zoom+'× · '+
      (acquisition.collimator==='NONE'?'Sin colimador':acquisition.collimator)+' · '+acquisition.energyCenter+' keV / '+acquisition.windowWidth+'%'+
      (boneSignal.mode==='live'?' · Últimos '+String(boneSignal.duration).replace('.',',')+' s':'');
''',1)
html=re.sub(r'(<div class="gantry-live-grid">)\s+(<div class="live-card bone-acq-card">)',r'\1\n            \2',html)
url = asset((ROOT / 'scripts/gantry_workspace.css').read_bytes(), 'gantry-workspace', 'css')
block = '<!-- WORKSPACE_LAYOUT_BEGIN -->\n<link rel="stylesheet" href="' + url + '">\n<!-- WORKSPACE_LAYOUT_END -->'
if '<!-- WORKSPACE_LAYOUT_BEGIN -->' in html:
    html = re.sub(r'<!-- WORKSPACE_LAYOUT_BEGIN -->.*?<!-- WORKSPACE_LAYOUT_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('</head>', block + '\n</head>', 1)
anchor = '<div style="flex:none;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
if 'id="gantryViewControls"' not in html:
    assert html.count(anchor) == 1
    html = html.replace(anchor, anchor.replace('<div ', '<div id="gantryViewControls" '), 1)
page.write_text(html, encoding='utf-8', newline='\n')
print('Workspace layout embedded')

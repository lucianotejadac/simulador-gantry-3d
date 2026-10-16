"""Vendor the educational viewer and install the lazy same-page bridge."""
from pathlib import Path
import hashlib
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'simulador-cintigrafia-osea'
DEST = ROOT / 'processing'
DEST.mkdir(exist_ok=True)
# Keep a pristine, pinned upstream source so packaging works without its checkout.
upstream = DEST / 'viewer-source.html'
if not upstream.exists():
    shutil.copyfile(SOURCE / 'demo/index.html', upstream)
    shutil.copyfile(SOURCE / 'LICENSE', DEST / 'LICENSE')
s = upstream.read_text(encoding='utf-8')
s = s.replace('tutorialToggle(true);\n</script>', 'tutorialToggle(false);\n</script>')
s = s.replace('if(window.showSaveFilePicker){', 'if(window.showSaveFilePicker&&window.top===window){')
s = re.sub(r"status\('Versión demo\..*?;", "status('Procesamiento integrado del gantry. Envía adquisiciones desde la lista superior.');", s)
s = s.replace('</body>', '<style>#open-demo{display:none!important}header h1{font-size:14px}</style>\n<script>\n' +
              (ROOT / 'scripts/processing_receiver.js').read_text(encoding='utf-8') + '\n</script>\n</body>')
# The private 32-bit teaching SOP carries administered activity in MBq, like NM.
s = s.replace("sop==='1.2.840.10008.5.1.4.1.1.20'?'MBq'", "(sop==='1.2.840.10008.5.1.4.1.1.20'||sop==='2.25.216145721041023267506752105223475669900')?'MBq'")
(DEST / 'index.html').write_text(s, encoding='utf-8', newline='\n')
version = hashlib.sha256(s.encode()).hexdigest()[:16]
p = ROOT / 'index.html'
html = p.read_text(encoding='utf-8')
ui = '''<!-- PROCESSING_UI_BEGIN -->
    <style>
    #gantryWorkspace[hidden],#boneProcessingPane[hidden]{display:none!important}
    #boneProcessingPane{height:calc(100% - 28px);display:flex;flex-direction:column;background:#c0c0c0;padding:6px;box-sizing:border-box}
    #boneProcessingToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:12px Arial;padding:4px}
    #boneProcessingList{max-height:92px;overflow:auto;display:grid;gap:5px;background:#eee;padding:6px;font:12px Arial}
    #boneProcessingList label{display:flex;gap:7px;align-items:center}
    #boneProcessingStatus{padding:5px;font:12px Arial;color:#003d30}
    #boneProcessingFrame{flex:1;min-height:280px;width:100%;border:1px solid #777;background:#008080}
    #boneProcessingNotice{color:#8b2300;font:12px Arial}
    #boneGantryTab[aria-selected=true],#boneProcessingTab[aria-selected=true]{font-weight:bold;color:#000080}
    </style>
    <section id="boneProcessingPane" hidden aria-label="Procesamiento óseo">
      <div id="boneProcessingToolbar"><strong>Procesamiento óseo</strong>
        <button id="boneProcessingBack" type="button">Volver al gantry</button>
        <button id="boneProcessingRefresh" type="button">Actualizar lista</button>
        <button id="boneProcessingSend" type="button" disabled>Enviar seleccionadas</button>
        <button id="boneProcessingRetry" type="button" hidden>Reintentar carga</button>
        <span>El proyecto se conserva al volver al gantry. Guarda el proyecto antes de cerrar o recargar.</span>
      </div>
      <div id="boneProcessingList" aria-label="Adquisiciones óseas finalizadas"></div>
      <div id="boneProcessingStatus" role="status"></div>
      <iframe id="boneProcessingFrame" title="Procesador de cintigrafía ósea" data-src="processing/index.html?v=VERSION"></iframe>
    </section>
    <!-- PROCESSING_UI_END -->
'''.replace('VERSION', version)
if '<!-- PROCESSING_UI_BEGIN -->' in html:
    html = re.sub(r'<!-- PROCESSING_UI_BEGIN -->.*?<!-- PROCESSING_UI_END -->\n', lambda _: ui, html, flags=re.S)
else:
    html = html.replace('    <div id="gantryWorkspace"', ui + '    <div id="gantryWorkspace"', 1)
if 'id="boneProcessingTab"' not in html:
    html = html.replace('      <button class="rights-trigger" id="copyrightOpen"', '''      <button class="rights-trigger" id="boneGantryTab" type="button" aria-selected="true">Gantry</button>
      <button class="rights-trigger" id="boneProcessingTab" type="button" aria-selected="false">Procesamiento óseo</button>
      <span id="boneProcessingNotice" role="status"></span>
      <button class="rights-trigger" id="copyrightOpen"''', 1)
if 'id="boneSendProcessing"' not in html:
    html = html.replace('<button id="boneAcqSave"', '<button id="boneSendProcessing" class="live-setting" type="button">Enviar a procesamiento</button>\n            <button id="boneAcqSave"', 1)
html = html.replace("if(document.hidden || !activeStudy().linear", "if(window.GANTRY_PROCESSING?.active || document.hidden || !activeStudy().linear")
engine = '\n'.join((ROOT / 'scripts' / name).read_text(encoding='utf-8') for name in ['processing_dicom.js', 'processing_bridge.js'])
# Small controller only; the large viewer/parser is fetched on demand via iframe.
block = '<!-- PROCESSING_ENGINE_BEGIN -->\n<script>\n' + engine + '\n</script>\n<!-- PROCESSING_ENGINE_END -->'
if '<!-- PROCESSING_ENGINE_BEGIN -->' in html:
    html = re.sub(r'<!-- PROCESSING_ENGINE_BEGIN -->.*?<!-- PROCESSING_ENGINE_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('</body>', block + '\n</body>', 1)
p.write_text(html, encoding='utf-8', newline='\n')
print('Lazy bone processor packaged:', version)

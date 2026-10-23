"""Vendor the educational viewer and install the lazy same-page bridge."""
from pathlib import Path
import hashlib
import re
import shutil
from externalize_assets import asset

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
# The integrated edition receives images only from the simulator bridge.
# Keep the pinned upstream untouched; omit its external case/tutorial bundle.
demo_start = s.index('const demoCase={')
demo_end = s.index('</script>', demo_start)
s = s[:demo_start] + "status('Usa Adquirir para crear imágenes desde el simulador.');\n" + s[demo_end:]
for id in ['open-demo', 'open', 'open-folder']:
    s = re.sub(r'<button\b[^>]*\bid="' + id + r'"[^>]*>.*?</button>', '', s)
for id in ['file', 'folder']:
    s = re.sub(r'<input\b[^>]*\bid="' + id + r'"[^>]*>', '', s)
s = re.sub(r"^\$\('open'\)\.onclick=.*?;\n", '', s, flags=re.M)
s = re.sub(r"^\$\('open-folder'\)\.onclick=.*?;\n", '', s, flags=re.M)
# Remove folder/multi-file imports and replace the drop handler with a no-op
# that prevents the browser from navigating away to a dropped external file.
start = s.index('async function loadFolder(files){')
end = s.index("document.querySelectorAll('.tabs [role=tab]')", start)
s = s[:start] + "document.addEventListener('dragover',e=>e.preventDefault());\ndocument.addEventListener('drop',e=>{e.preventDefault();status('Adquiere las imágenes desde el simulador mediante el menú Adquirir.');});\n" + s[end:]
s = s.replace('<button class="primary" id="open-project">Abrir proyecto</button>', '')
s = s.replace('<input id="project-file" type="file" accept=".dicomproject,application/json" hidden>', '')
s = re.sub(r"\$\('save-project'\)\.onclick=saveProject;\$\('open-project'\).*?;\n",
           "$('save-project').onclick=saveProject;\n", s)
for old, new in {
    'Visualizador DICOM': 'Procesamiento óseo',
    'Medicina nuclear · Versión demo con tutorial de uso': 'Adquisiciones del simulador gantry',
    'Archivo DICOM · Solo lectura': 'Adquisiciones del simulador',
    'aria-label="Datos DICOM"': 'aria-label="Datos de adquisición"',
    'id="modality">DICOM</span>': 'id="modality">SIMULADO</span>',
    'Abre un archivo DICOM o arrástralo aquí. También admite archivos sin extensión.': 'Usa Adquirir para crear imágenes desde el simulador.',
    'Lectura local: los archivos permanecen en este navegador. Sin conexión ni instalación.': 'Procesamiento local de adquisiciones del simulador gantry.',
    'Sin archivo': 'Sin adquisición',
    'Abre un DICOM para cargarlo en su tipo de adquisición.': 'Usa Adquirir para crear una imagen desde el gantry.',
    'Carga un DICOM<br>para visualizar la imagen': 'Inicia una adquisición<br>desde el simulador',
    'Carga archivos DICOM para componer una página. Puedes seleccionar varios archivos a la vez.': 'Adquiere imágenes desde el simulador para componer una página.',
    'No hay imágenes disponibles. Carga primero uno o varios archivos con «Abrir DICOM…».': 'No hay imágenes disponibles. Inicia una adquisición desde el menú Adquirir.',
    'Explorar etiquetas DICOM': 'Detalles técnicos de la adquisición',
    ":'DICOM';": ":'SIMULADO';",
}.items():
    s = s.replace(old, new)
s = re.sub(r"status\('Abre un archivo DICOM de '.*?\);",
           "status('Selecciona Adquirir para iniciar una adquisición del simulador.');", s)
s = s.replace('if(window.showSaveFilePicker){', 'if(window.showSaveFilePicker&&window.top===window){')
# Header entry can be dismissed without saving in the simulator edition.
s = s.replace('flex.headerRequired=required&&!existing;', 'flex.headerRequired=false;')
s = s.replace("flex.headerRequired?'Establecer encabezado obligatorio':'Editar encabezado común'", "existing?'Editar encabezado común':'Establecer encabezado'")
s = s.replace("flex.headerRequired?'Para usar Página flexible, establece primero un encabezado. Se aplicará a todas las páginas.':'Este encabezado es común: los cambios se aplicarán a todas las páginas actuales y nuevas.'", "'Puedes cerrar este cuadro sin completar el encabezado. Si lo aplicas, se usará en todas las páginas.'")
s = re.sub(r"status\('Versión demo\..*?;", "status('Usa Adquirir para configurar una nueva adquisición en los campos de este visor.');", s)
s = s.replace('</body>', '<style>body>header,#save-advice{display:none!important}body{padding:0!important}.application-bar .mode{display:none}#processingFileMenu{margin-left:auto;max-width:210px;height:25px;font-size:12px}</style>\n<style>' +
              (ROOT / 'scripts/processing_console.css').read_text(encoding='utf-8') + '</style>\n<script>\n' +
              (ROOT / 'scripts/processing_compact.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_acquisition_config.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_acquisition_actions.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_recorded_metadata.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_acquisition_editor.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_detector_pair.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_session_list.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_receiver.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/dynamic_correction.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_dynamic_correction.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_roi.js').read_text(encoding='utf-8') + '\n' +
              (ROOT / 'scripts/processing_analysis.js').read_text(encoding='utf-8') + '\n</script>\n</body>')
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
    #boneProcessingTools{position:relative;font:12px Arial;color:#000;margin-left:auto}
    #boneProcessingTools[hidden]{display:none}
    #boneProcessingTools>summary{cursor:pointer;padding:3px 8px}
    #boneProcessingToolsContent{position:absolute;right:0;top:100%;z-index:100;width:min(620px,85vw);padding:8px;background:#c0c0c0;border:2px outset #fff;box-shadow:2px 3px 8px #0005}
    #boneProcessingToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:12px Arial;padding:4px}
    #boneProcessingList{max-height:92px;overflow:auto;display:grid;gap:5px;background:#eee;padding:6px;font:12px Arial}
    #boneProcessingList label{display:flex;gap:7px;align-items:center}
    #boneProcessingStatus{padding:5px;font:12px Arial;color:#003d30}
    #boneProcessingFrame{flex:1;min-height:280px;width:100%;border:1px solid #777;background:#008080}
    #boneProcessingNotice{color:#8b2300;font:12px Arial}
    #boneGantryTab[aria-selected=true],#boneProcessingTab[aria-selected=true]{font-weight:bold;color:#000080}
    :is(#boneGantryTab,#boneProcessingTab):is(:hover,:focus){color:#fff}
    </style>
    <section id="boneProcessingPane" hidden aria-label="Procesamiento óseo">
      <div id="boneProcessingToolbar"><strong>Procesamiento óseo</strong>
        <button id="boneProcessingBack" type="button">Volver a adquisición</button>
        <button id="boneProcessingRefresh" type="button">Actualizar lista</button>
        <button id="boneProcessingRetry" type="button" hidden>Reintentar carga</button>
        <span>El proyecto se conserva al volver a adquisición. Guarda el proyecto antes de cerrar o recargar.</span>
      </div>
      <details><summary>Selección manual · las adquisiciones se cargan automáticamente en el menú izquierdo</summary>
        <div id="boneProcessingList" aria-label="Adquisiciones óseas finalizadas"></div>
        <button id="boneProcessingSend" type="button" disabled>Componer seleccionadas</button>
      </details>
      <div id="boneProcessingStatus" role="status"></div>
      <iframe id="boneProcessingFrame" title="Procesador de cintigrafía ósea" data-src="processing/index.html?v=VERSION"></iframe>
    </section>
    <!-- PROCESSING_UI_END -->
'''.replace('VERSION', version)
# Keep the processor in the right-hand workspace slot, beside the live monitors.
html = re.sub(r'<!-- PROCESSING_UI_BEGIN -->.*?<!-- PROCESSING_UI_END -->\n?', '', html, flags=re.S)
anchor = '<section class="gantry-live" id="gantryLive"'
assert anchor in html
html = html.replace(anchor, ui + anchor, 1)
if 'id="boneProcessingTab"' not in html:
    html = html.replace('      <button class="rights-trigger" id="copyrightOpen"', '''      <button class="rights-trigger" id="boneGantryTab" type="button" aria-selected="true">Gantry</button>
      <button class="rights-trigger" id="boneProcessingTab" type="button" aria-selected="false">Procesamiento óseo</button>
      <span id="boneProcessingNotice" role="status"></span>
      <button class="rights-trigger" id="copyrightOpen"''', 1)
if 'id="boneSendProcessing"' not in html:
    html = html.replace('<button id="boneAcqSave"', '<button id="boneSendProcessing" class="live-setting" type="button">Enviar a procesamiento</button>\n            <button id="boneAcqSave"', 1)
html = html.replace("if(window.GANTRY_PROCESSING?.active || document.hidden || !activeStudy().linear", "if(document.hidden || !activeStudy().linear")
engine = '\n'.join((ROOT / 'scripts' / name).read_text(encoding='utf-8') for name in ['processing_dicom.js', 'processing_acquisition_config.js', 'processing_acquisition_bridge.js', 'processing_bridge.js'])
# Cache the controller separately; the large viewer/parser stays lazy-loaded.
engine_url = asset(engine.encode('utf-8'), 'processing-controller', 'js')
block = '<!-- PROCESSING_ENGINE_BEGIN -->\n<script src="' + engine_url + '"></script>\n<!-- PROCESSING_ENGINE_END -->'
if '<!-- PROCESSING_ENGINE_BEGIN -->' in html:
    html = re.sub(r'<!-- PROCESSING_ENGINE_BEGIN -->.*?<!-- PROCESSING_ENGINE_END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('</body>', block + '\n</body>', 1)
p.write_text(html, encoding='utf-8', newline='\n')
print('Lazy bone processor packaged:', version)

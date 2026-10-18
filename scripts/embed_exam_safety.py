"""Publish the exam-wide training lock and its restart banner."""
from pathlib import Path
import re
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
url = asset((ROOT / 'scripts/exam_safety.js').read_bytes(), 'exam-safety', 'js')
block = '<!-- EXAM_SAFETY_BEGIN -->\n<script src="' + url + '"></script>\n<!-- EXAM_SAFETY_END -->'
if '<!-- EXAM_SAFETY_BEGIN -->' in s:
    s = re.sub(r'<!-- EXAM_SAFETY_BEGIN -->.*?<!-- EXAM_SAFETY_END -->', lambda _: block, s, flags=re.S)
else:
    anchor = '<script>\n\n/* ===== Ventana de posicionamiento'
    assert anchor in s
    s = s.replace(anchor, block + '\n' + anchor, 1)
if 'id="examSafetyBanner"' not in s:
    banner = '''<section id="examSafetyBanner" hidden role="alert" style="padding:10px;background:#641f28;color:#fff;border:2px solid #ff6f7d;font:12px sans-serif">
      <strong id="examSafetyMessage"></strong>
      <p id="examSafetyHint">Libera el contacto y reinicia para comenzar un nuevo examen. Las adquisiciones anteriores guardadas se conservan.</p>
      <button type="button" class="btn" id="examRestart">Reiniciar examen</button>
    </section>'''
    # Insert inside the existing acquisition console, above its settings.
    pattern = r'(<section[^>]*id="gantryLive"[^>]*>)'
    s, n = re.subn(pattern, lambda m: m[1] + '\n' + banner, s, count=1)
    assert n == 1
p.write_text(s, encoding='utf-8', newline='\n')
print('Exam safety gate embedded')

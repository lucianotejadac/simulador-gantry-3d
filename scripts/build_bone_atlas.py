"""Embed the supplied bone projections; requires Python and Pillow.

Run from any directory. The original ZIP is retained without modifications.
0 and 360 degrees represent the same direction: use 0 at the circular seam.
"""
from pathlib import Path
from PIL import Image, ImageOps
import base64
import io
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/cintigrama_0_a_360_cada_22_5_grados.zip"
FRAME_W, FRAME_H, COLS = 480, 960, 8


def build_atlas():
    atlas = Image.new("L", (FRAME_W * COLS, FRAME_H * 2))
    with zipfile.ZipFile(SOURCE) as archive:
        for index in range(16):
            angle = format(index * 22.5, "g").replace(".", "_")
            with Image.open(io.BytesIO(archive.read(f"{angle}_grados.png"))) as original:
                # Shared vertical bounds preserve registration across projections.
                # Remove the frame and angle label without stretching the anatomy.
                projection = original.convert("L").crop((5, 33, original.width - 6, 502))
                projection = ImageOps.invert(projection)
                # Suppress only the near-white paper background, retaining counts.
                projection = projection.point(lambda value: max(0, value - 12) * 255 // 243)
                width = round(projection.width * FRAME_H / projection.height)
                projection = projection.resize((width, FRAME_H), Image.Resampling.LANCZOS)
                atlas.paste(projection, (
                    index % COLS * FRAME_W + (FRAME_W - width) // 2,
                    index // COLS * FRAME_H,
                ))
    data = io.BytesIO()
    atlas.save(data, format="PNG", optimize=True)
    return base64.b64encode(data.getvalue()).decode("ascii")


if __name__ == "__main__":
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")
    block = ('<!-- Atlas de cintigrama oseo incorporado. -->\n<script>\n'
             'window.GANTRY_LIVE_ATLAS_OSEO="data:image/png;base64,' + build_atlas() +
             '";\n</script>\n')
    pattern = r'<!-- Atlas de cintigrama oseo incorporado\. -->\n<script>.*?</script>\n'
    if re.search(pattern, html, re.S):
        html = re.sub(pattern, lambda _: block, html, count=1, flags=re.S)
    else:
        marker = '<!-- Motor de imagen en vivo incorporado. -->'
        assert marker in html
        html = html.replace(marker, block + marker, 1)
    path.write_text(html, encoding="utf-8", newline="\n")
    print("Embedded 16 unique bone views (0–337.5 degrees); 360 wraps to 0.")

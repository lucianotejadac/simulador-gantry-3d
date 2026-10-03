"""Embed the supplied bone projections; requires Python and Pillow.

Run from any directory. The original montages are retained without modifications.
Use the labelled angles: the arms-down montage omits 135 and 225 degrees.
Use 0 at the circular seam; the supplied 360 panel is retained in the source.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import base64
import io
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/cintigrama-oseo-al-costado.jpg"
BONE_ANGLES = [0,22.5,45,67.5,90,112.5,157.5,180,202.5,247.5,270,292.5,315,337.5]
FRAME_W, FRAME_H, COLS = 480, 960, 8
UP_FRAME_H, UP_OFFSET = 1080, 120


def build_atlas():
    atlas = Image.new("L", (FRAME_W * COLS, FRAME_H * 2))
    columns = [0,153,307,462,617,770]
    rows = [(9,337),(353,681),(697,1021)]
    with Image.open(SOURCE) as original:
        if original.size != (770,1024):
            raise ValueError('Unexpected montage size; recheck panel bounds')
        for index, angle in enumerate(BONE_ANGLES):
            row, column = divmod(index,5)
            top,bottom = rows[row]
            projection = original.convert('L').crop(
                (columns[column]+3,top,columns[column+1]-3,bottom))
            # Captions occupy the upper RIGHT corner in this montage.
            caption_width = 9 + sum(5 if c=='.' else 10 for c in format(angle,'g'))
            ImageDraw.Draw(projection).rectangle(
                (projection.width-caption_width-3,0,projection.width,18),fill=255)
            projection = ImageOps.invert(projection)
            projection = projection.point(lambda value:max(0,value-12)*255//243)
            width = round(projection.width*FRAME_H/projection.height)
            projection = projection.resize((width,FRAME_H),Image.Resampling.LANCZOS)
            atlas.paste(projection,(index%COLS*FRAME_W+(FRAME_W-width)//2,
                                    index//COLS*FRAME_H))
    data = io.BytesIO()
    atlas.save(data, format="PNG", optimize=True)
    return base64.b64encode(data.getvalue()).decode("ascii")


def build_arms_up_atlas():
    # Panel borders in the supplied 1536 x 1024 montage. The rows have
    # different widths; a uniform grid would mix neighbouring projections.
    rows = [
        (0, [(3,171),(176,344),(349,518),(524,691),(697,840),
             (846,1012),(1018,1186),(1192,1355),(1361,1532)]),
        (512, [(3,190),(195,381),(386,572),(577,765),(771,958),
               (962,1149),(1154,1342)]),
    ]
    atlas = Image.new("L", (FRAME_W * COLS, UP_FRAME_H * 2))
    scale = FRAME_H / (502 - 54)  # Skull to feet, independent of raised hands.
    with Image.open(ROOT / 'assets/cintigrama-oseo-brazos-arriba.png') as original:
        if original.size != (1536, 1024):
            raise ValueError('Unexpected montage dimensions; recheck panel borders')
        index = 0
        for row_y, panels in rows:
            for left, right in panels:
                projection = original.convert('L').crop((left+3,row_y+5,right-3,row_y+502))
                # Erase only the angle caption in the upper left, not the hands.
                caption = format(index * 22.5, 'g')
                caption_right = 8 + sum(6 if c == '.' else 11 for c in caption) + 10
                ImageDraw.Draw(projection).rectangle((0,0,caption_right,27), fill=255)
                projection = ImageOps.invert(projection)
                projection = projection.point(lambda value: max(0,value-12)*255//243)
                projection = projection.resize((round(projection.width*scale),
                    round(projection.height*scale)), Image.Resampling.LANCZOS)
                atlas.paste(projection, (index%COLS*FRAME_W+(FRAME_W-projection.width)//2,
                    index//COLS*UP_FRAME_H+round(UP_OFFSET+(5-54)*scale)))
                index += 1
    data = io.BytesIO()
    atlas.save(data, format='PNG', optimize=True)
    return base64.b64encode(data.getvalue()).decode('ascii')


def embed(html, name, variable, data):
    block = ('<!-- Atlas de '+name+' incorporado. -->\n<script>\n'
             'window.'+variable+'="data:image/png;base64,' + data +
             '";\n</script>\n')
    pattern = r'<!-- Atlas de '+re.escape(name)+r' incorporado\. -->\n<script>.*?</script>\n'
    if re.search(pattern, html, re.S):
        html = re.sub(pattern, lambda _: block, html, count=1, flags=re.S)
    else:
        marker = '<!-- Motor de imagen en vivo incorporado. -->'
        assert marker in html
        html = html.replace(marker, block + marker, 1)
    return html


if __name__ == "__main__":
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")
    html = embed(html, 'cintigrama oseo', 'GANTRY_LIVE_ATLAS_OSEO', build_atlas())
    html = embed(html, 'cintigrama oseo brazos arriba', 'GANTRY_LIVE_ATLAS_OSEO_UP',
                 build_arms_up_atlas())
    path.write_text(html, encoding="utf-8", newline="\n")
    print("Embedded 14 arms-down and 16 arms-up views; 360 wraps to 0.")

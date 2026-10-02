"""Replace the embedded exploration atlas using the supplied montage.

Run: python scripts/build_exploration_atlas.py (requires Pillow).
The original image is retained unchanged. 360 degrees repeats 0 degrees.
"""
from PIL import Image, ImageDraw, ImageOps
import base64
import io
from build_bone_atlas import ROOT, FRAME_W, FRAME_H, COLS, embed


def build_atlas():
    # Explicit panel bounds: the montage has nine panels above and eight below,
    # with unequal widths. The final 360-degree reference is not duplicated.
    rows = [
        (25, 497, 34, [(5,178),(185,345),(351,510),(516,678),(685,847),
                      (854,1018),(1025,1188),(1195,1356),(1363,1530)]),
        (532, 988, 546, [(5,185),(191,369),(375,552),(559,754),(761,946),
                        (953,1137),(1143,1332)]),
    ]
    atlas = Image.new('L', (FRAME_W*COLS, FRAME_H*2))
    with Image.open(ROOT / 'assets/exploracion.png') as original:
        if original.size != (1536,1024):
            raise ValueError('Unexpected montage size; recheck panel bounds')
        source = original.convert('L')
        index = 0
        for top, bottom, caption_bottom, panels in rows:
            for left, right in panels:
                projection = source.crop((left+3,top,right-3,bottom))
                caption = format(index*22.5, 'g')
                caption_right = 10 + sum(6 if c=='.' else 11 for c in caption) + 10
                ImageDraw.Draw(projection).rectangle(
                    (0,0,caption_right,caption_bottom-top), fill=255)
                projection = ImageOps.invert(projection)
                projection = projection.point(lambda value:max(0,value-12)*255//243)
                width = round(projection.width*FRAME_H/projection.height)
                projection = projection.resize((width,FRAME_H),Image.Resampling.LANCZOS)
                atlas.paste(projection, (index%COLS*FRAME_W+(FRAME_W-width)//2,
                                         index//COLS*FRAME_H))
                index += 1
    output = io.BytesIO()
    atlas.save(output,format='PNG',optimize=True)
    return base64.b64encode(output.getvalue()).decode('ascii')


if __name__ == '__main__':
    path = ROOT / 'index.html'
    html = embed(path.read_text(encoding='utf-8'), 'exploracion I-131',
                 'GANTRY_LIVE_ATLAS_EXPLORACION', build_atlas())
    path.write_text(html,encoding='utf-8',newline='\n')
    print('Replaced exploration with 16 supplied views; 360 wraps to 0.')

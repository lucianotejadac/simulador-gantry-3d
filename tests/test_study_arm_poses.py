"""Both arm poses remain selectable, use their own fields, and survive study changes."""
from pathlib import Path
import json,re,zlib
import numpy as np
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
data=json.loads(re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n',html)[1])
for name in ['thyroid','exploration','dmsa','maa','mibi']:
    keys=[name,name+'_up'] if name!='mibi' else ['mibi_down','mibi_up']
    totals=[]
    for key in keys:
        p=data[key]
        f=np.frombuffer(zlib.decompress((ROOT/p['url']).read_bytes()),'<u2').reshape(len(p['angles']),p['height'],p['width'])*p['scale']
        totals.append(f.sum(axis=(1,2)))
        assert np.isfinite(f).all() and f.max()>0
    ratios=totals[1]/totals[0]
    assert np.ptp(ratios)>.001,(name,'attenuation must vary with projection angle')
    print(name,'up/down angular count ratio',float(ratios.min()),float(ratios.max()))

with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url)
    page.wait_for_function('window.GANTRY_LIVE?.ready',timeout=120000)
    page.evaluate('()=>{Object.assign(GANTRY.G,{tableZ:176,tableH:85,rot:0});GANTRY.render()}')
    for study in ['thyroid','exploration','dmsa','maa','parathyroid','mibi','bone','mag3']:
        position={'thyroid':190,'parathyroid':180,'dmsa':110}.get(study,150)
        page.evaluate('(z)=>{GANTRY.G.tableZ=z;GANTRY.render()}',position)
        rates=[]
        for arms in ['up','down']:
            page.evaluate('(arms)=>{GANTRY.G.arms=arms;GANTRY.render()}',arms)
            page.evaluate('(study)=>GANTRY_LIVE.setStudy(study)',study)
            page.wait_for_function('(s)=>GANTRY_LIVE.ready&&GANTRY_LIVE.state?.d1?.study===s',arg=study,timeout=120000)
            assert page.evaluate('GANTRY.G.arms')==arms,(study,arms)
            assert page.locator('[data-arms="up"]').is_enabled()
            assert page.locator('[data-arms="down"]').is_enabled()
            if study!='mag3':
                assert page.evaluate('GANTRY_LIVE.state.d1.arms')==arms
                rates.append(page.evaluate('GANTRY_LIVE.state.d1.expectedRate'))
                assert rates[-1]>0,(study,arms,'positioned live field is empty')
        print('Runtime',study,rates)
        if study in ['dmsa','mibi']:
            lateral=[]
            for arms in ['down','up']:
                page.evaluate('(arms)=>{GANTRY.G.arms=arms;GANTRY.G.rot=90;GANTRY.render()}',arms)
                page.wait_for_function('GANTRY_LIVE.ready')
                lateral.append(page.evaluate('GANTRY_LIVE.state.d1.expectedRate'))
            assert abs(lateral[1]-lateral[0])>.01*max(lateral),(study,lateral)
            print('Lateral',study,lateral)
            page.evaluate('()=>{GANTRY.G.rot=0;GANTRY.render()}')
    assert not errors,errors
    browser.close()
print('OK: all studies support both anatomical arm poses without forced repositioning.')

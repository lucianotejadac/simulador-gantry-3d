"""Raised elbows stay close to shoulders, with matching voxel anatomy."""
from pathlib import Path
import json
import numpy as np
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
meta=json.loads((ROOT.parent/'icrp145-oseo-360/brazos-arriba/metadatos.json').read_text(encoding='utf-8'))
for arm in meta['articulaciones']:
    shoulder,elbow,wrist=(np.array(arm[k]) for k in ['hombro_mm','codo_mm','muneca_mm'])
    assert abs(elbow[0]-shoulder[0])<65
    assert wrist[2]>elbow[2]>shoulder[2]
    assert np.dot((elbow-shoulder)/np.linalg.norm(elbow-shoulder),(wrist-elbow)/np.linalg.norm(wrist-elbow))>.9

with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    baseline=browser.new_page()
    old_pose=(ROOT/'index.html').read_text(encoding='utf-8').replace('Math.atan2(.20,-.9797958971)','Math.atan2(.60,-.80)').replace('Math.atan2(-.20,-.9797958971)','Math.atan2(-.60,-.80)').replace('_dir.set(-.9797958971, 0, .20*p.side)','_dir.set(-.80, 0, .60*p.side)').replace('_dir.set(-.9797958971, 0, -.20*p.side)','_dir.set(-.80, 0, -.60*p.side)')
    baseline.route('**/index.html',lambda route:route.fulfill(body=old_pose,content_type='text/html'))
    baseline.goto(url)
    baseline.wait_for_function("window.GANTRY3D?.patientPlacement().source==='glb'",timeout=120000)
    baseline.evaluate("()=>{Object.assign(GANTRY.G,{arms:'up',rot:45,tableZ:190,tableH:85,detDist1:45,detDist2:45});GANTRY.render()}")
    old_limits=baseline.evaluate('GANTRY3D.limits(GANTRY.G)')
    baseline.close()
    page=browser.new_page(viewport={'width':1600,'height':1000})
    page.goto(url)
    page.wait_for_function("window.GANTRY3D?.patientPlacement().source==='glb'",timeout=120000)
    page.evaluate("()=>{Object.assign(GANTRY.G,{arms:'up',rot:45,tableZ:190,tableH:85,detDist1:45,detDist2:45});GANTRY.render()}")
    arms=page.evaluate('GANTRY3D.patientPlacement().arms')
    for arm in arms:
        shoulder,elbow,wrist=(np.array(arm[k]) for k in ['shoulder','elbow','wrist'])
        assert abs(elbow[2]-shoulder[2])<.08
        assert wrist[0]<elbow[0]<shoulder[0]
        assert np.dot((elbow-shoulder)/np.linalg.norm(elbow-shoulder),(wrist-elbow)/np.linalg.norm(wrist-elbow))>.9
    limits=page.evaluate('GANTRY3D.limits(GANTRY.G)')
    assert limits['d1']<old_limits['d1'],(old_limits,limits)
    print('Oblique limits, old/new:',old_limits,limits,'joints:',arms)
    page.wait_for_function('window.GANTRY_LIVE?.ready',timeout=120000)
    page.screenshot(path=str(ROOT.parent/'gantry-extended-arms.png'))
    browser.close()
print('OK: extended raised arms agree in voxel geometry and articulated 3D patient.')

from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site
ROOT=Path(__file__).resolve().parents[1]
with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000})
    page.goto(url)
    page.wait_for_function("window.GANTRY3D?.patientPlacement().source==='glb' && !document.getElementById('gantryWin').inert",timeout=120000)
    feet=page.evaluate('GANTRY_FOOT_POSE.feet')
    assert len(feet)==2 and {f['side'] for f in feet}=={-1,1},feet
    for f in feet:assert f['direction'][2]*f['side']>.4,feet
    for head_first in [False,True]:
        page.evaluate("v=>{GANTRY_PATIENT3D.headFirst=v;Object.assign(GANTRY.G,{tableZ:0,tableH:85,detDist1:45,detDist2:45});GANTRY.render();}",head_first)
        placement=page.evaluate('GANTRY3D.patientPlacement()')
        assert abs(placement['gapCm'])<.15,placement
        assert placement['supportedX'],placement
    page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=false;GANTRY.G.tableZ=-50;GANTRY.render();GANTRY3D.view('sup');document.getElementById('gantryRemote').style.display='none';document.getElementById('g3dHud').style.display='none';}")
    page.screenshot(path=str(ROOT.parent/'gantry-resting-feet.png'))
    print('OK: both feet point outwards, seated on table in both entry directions.',feet)
    browser.close()

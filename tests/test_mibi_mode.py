"""MIBI enlarged LV: offline data fidelity, pose and temporal acquisition."""
from pathlib import Path
import base64, hashlib, json, re, zlib
import numpy as np
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
packed=json.loads(re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n',html).group(1))['mibi_up']
frames=np.frombuffer(zlib.decompress((ROOT/packed['url']).read_bytes()),dtype='<u2').reshape(72,768,320)*packed['scale']
provenance=json.loads((ROOT/'assets/icrp145/procedencia.json').read_text(encoding='utf-8'))['mibi_up']
assert packed['angles']==list(range(0,360,5))
assert abs(frames[0].sum()/2000000-1)<.0001
assert provenance['region_vi_aproximada']['escala_lineal_vi']==1.25
assert provenance['region_vi_aproximada']['desplazamiento_inferior_mm']==6
source=ROOT.parent/'icrp145-multitrazador-ap-pa/mibi-360-brazos-arriba/proyecciones_lineales.npz'
if source.exists():
    assert hashlib.sha256(source.read_bytes()).hexdigest()==provenance['sha256_proyecciones_lineales']
    expected=np.load(source)['cuentas_esperadas']*provenance['factor_referencia_motor']
    assert np.max(np.abs(frames-expected))<=packed['scale']*.51

with serve_site() as site_url, sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(site_url+'?demo=mibi-brazos-arriba')
    page.wait_for_function("window.GANTRY_LIVE && GANTRY_LIVE.ready && GANTRY_LIVE.settings.study==='mibi'")
    assert page.evaluate("GANTRY.G.arms==='up' && GANTRY_LIVE.state.d1.arms==='up'")
    assert page.locator('[data-arms="down"]').is_disabled()
    assert page.locator('#boneSignalControls').is_visible()
    assert page.evaluate('GANTRY_LIVE.angles.length===72')
    page.wait_for_timeout(1200)
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts>0 && GANTRY_LIVE.state.d2.windowCounts>0')
    image=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.wait_for_timeout(350)
    assert image!=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.click('#bonePause');image=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.wait_for_timeout(300)
    assert image==page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.click('#boneClear')
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts===0')
    page.click('#bonePause')
    page.evaluate('GANTRY_LIVE.setPersistence(.25)')
    page.wait_for_timeout(650)
    page.evaluate('GANTRY_LIVE.update({...GANTRY.G,tableZ:-100})')
    page.wait_for_timeout(650)
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts===0 && GANTRY_LIVE.state.d2.windowCounts===0')
    page.evaluate("GANTRY.render();GANTRY_LIVE.setSignalMode('reference')")
    initial=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.evaluate('GANTRY.G.rot=37;GANTRY.render()')
    assert initial!=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    assert page.evaluate('Math.abs(((GANTRY_LIVE.state.d2.rawAngle-GANTRY_LIVE.state.d1.rawAngle+360)%360)-180)<1e-8')
    page.evaluate('GANTRY_LIVE.setMatrix(256)');rate=page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    page.evaluate('GANTRY_LIVE.setMatrix(128)');other=page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    assert abs(rate-other)/rate<.03
    page.evaluate('GANTRY_LIVE.setMatrix(256)')
    mibi=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.select_option('#liveStudy','bone')
    page.wait_for_function('GANTRY_LIVE.ready')
    assert page.locator('[data-arms="down"]').is_enabled()
    assert mibi!=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()'),'Stale cached MIBI field in bone mode'
    page.click('[data-arms="down"]');page.select_option('#liveStudy','mibi')
    assert page.evaluate("GANTRY.G.arms==='up'")
    assert mibi==page.locator('#liveD1').evaluate('(c)=>c.toDataURL()'),'Pose or field not restored'
    page.select_option('#liveStudy','thyroid')
    assert page.locator('#boneSignalControls').is_visible()
    page.select_option('#liveStudy','mibi')
    page.evaluate('GANTRY.G.rot=0;GANTRY.render()')
    page.locator('#gantryLive').screenshot(path=str(ROOT/'assets/icrp145/mibi-integrado.png'))
    assert not errors,errors
    browser.close()
print('OK: latest 72-view MIBI offline, enlarged LV, pose, detector angles, live persistence, freeze, expiry, matrix conservation and study switching.')

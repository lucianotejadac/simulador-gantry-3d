"""Integración offline del fantoma articulado y adquisición temporal real."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
with serve_site() as site_url, sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(site_url)
    page.wait_for_function('window.GANTRY_LIVE && window.GANTRY3D')
    page.evaluate("GANTRY_LIVE.setStudy('bone')")
    page.wait_for_function('GANTRY_LIVE.ready')
    page.evaluate('GANTRY_ICRP.ready')  # The following checks intentionally inspect both poses.
    page.evaluate('''() => {
      GANTRY_PATIENT3D.headFirst=false;GANTRY_ACQUISITION.headFirst=false;
      GANTRY_ACQUISITION.decubitus='supine';
      GANTRY_LIVE.setCollimator('LEHR');GANTRY_LIVE.setEnergyCenter(140);
      GANTRY_LIVE.setWindowWidth(20);GANTRY_LIVE.setZoom(1);GANTRY_LIVE.setMatrix(256);
      Object.assign(GANTRY.G,{arms:'up',rot:0,tableZ:175,tableH:92,detDist1:35,detDist2:35});
      GANTRY.render();
      for(const pose of [GANTRY_ICRP.poses.down,GANTRY_ICRP.poses.up]){
        if(pose.frames.length!==80 || pose.angles.length!==80)throw Error('Missing directions');
        if(!pose.frames.every(frame=>frame.some(v=>v>0)))throw Error('Empty projection');
      }
    }''')
    page.wait_for_timeout(1100)
    first=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts>0 && GANTRY_LIVE.state.d2.windowCounts>0')
    page.wait_for_timeout(300)
    assert first!=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()'),'Static noise'
    page.click('#bonePause')
    frozen=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    clock=page.evaluate('GANTRY_LIVE.signal.time')
    page.wait_for_timeout(350)
    assert frozen==page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    assert clock==page.evaluate('GANTRY_LIVE.signal.time')
    page.click('#boneClear')
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts===0 && GANTRY_LIVE.state.d2.windowCounts===0')
    page.click('#bonePause')
    page.evaluate('GANTRY_LIVE.setPersistence(.25)')
    page.wait_for_timeout(650)
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts>0')
    page.evaluate('GANTRY_LIVE.update({...GANTRY.G,tableZ:-100})')
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts>0'),'Motion erased persistence'
    page.wait_for_timeout(650)
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts===0 && GANTRY_LIVE.state.d2.windowCounts===0'),'Expired events remained'
    page.evaluate('GANTRY.render();GANTRY_LIVE.setPersistence(5);GANTRY_LIVE.setCountRate(15000)')
    page.wait_for_timeout(1100)
    assert page.evaluate('GANTRY_LIVE.state.d1.windowCounts>0')
    page.click('[data-arms="down"]')
    assert page.evaluate("GANTRY_LIVE.state.d1.arms==='down' && GANTRY_LIVE.angles.length===80")
    page.click('[data-arms="up"]')
    page.select_option('#boneSignalMode','reference')
    assert page.locator('#bonePause').is_disabled()
    frozen=page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.wait_for_timeout(250)
    assert frozen==page.locator('#liveD1').evaluate('(c)=>c.toDataURL()')
    page.evaluate('''() => {
      const canvas=document.getElementById('liveD1');const box=canvas.getBoundingClientRect();
      const card=canvas.parentElement.getBoundingClientRect();
      if(box.height>card.height+1 || Math.abs(box.width-box.height)>1)
        throw Error('Detector canvas clipped or distorted');
      // Estimación de campo y muestreo: la matriz conserva cuentas esperadas.
      GANTRY_LIVE.setMatrix(256);const a=GANTRY_LIVE.state.d1.expectedRate;
      GANTRY_LIVE.setMatrix(128);const b=GANTRY_LIVE.state.d1.expectedRate;
      if(Math.abs(a-b)/a>.03)throw Error('Matrix changes physical count rate');
    }''')
    page.select_option('#liveStudy','thyroid')
    assert not page.locator('#boneSignalControls').is_visible()
    page.select_option('#liveStudy','bone')
    assert page.locator('#boneSignalControls').is_visible()
    assert not errors,errors
    browser.close()
    print('OK: 160 projections offline; live noise, pause, reset, finite persistence, pose switch, reference, count conservation, complete detector field.')

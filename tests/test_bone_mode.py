"""Browser regression check: pip install playwright; requires Google Chrome.

Run: python tests/test_bone_mode.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("https://**/*", lambda route: route.abort())
    page.route("http://**/*", lambda route: route.abort())
    page.goto((ROOT / "index.html").as_uri())
    page.wait_for_function("window.GANTRY_LIVE && window.GANTRY3D && GANTRY_LIVE.ready")
    page.select_option("#liveStudy", "bone")
    page.wait_for_function("GANTRY_LIVE.ready")
    result = page.evaluate("""() => {
      const live=GANTRY_LIVE;
      function check(ok,message){if(!ok) throw new Error(message);}
      check(live.settings.study==='bone','UI must select bone mode');
      check(live.angles.length===16,'Bone atlas has 16 unique directions');
      for(let angle=0;angle<360;angle+=22.5){
        const pair=live.framePair(angle);
        check(Math.abs(pair.a0+(pair.a1-pair.a0)*pair.mix-angle)<1e-8,
          'Incorrect atlas direction '+angle);
      }
      const seam=live.framePair(348.75);
      check(seam.lo===15 && seam.hi===0 && seam.mix===0.5,'Circular interpolation');
      check(JSON.stringify(live.framePair(0))===JSON.stringify(live.framePair(360)),
        '0 and 360 must produce the same frame');
      check(JSON.stringify(live.framePair(-11.25))===JSON.stringify(seam),
        'Negative rotation wraps');
      GANTRY_PATIENT3D.headFirst=false;
      GANTRY_ACQUISITION.headFirst=false;
      GANTRY_ACQUISITION.decubitus='supine';
      live.setCollimator('LEHR'); live.setEnergyCenter(140); live.setWindowWidth(20);
      live.setZoom(1); live.setMatrix(256);
      const state={...GANTRY.G,rot:0,tableZ:145,tableH:92,detDist1:25,detDist2:25};
      live.update(state);
      function pixels(id){
        const c=document.getElementById(id);
        return Array.from(c.getContext('2d').getImageData(1,1,c.width-2,c.height-2).data);
      }
      const anterior=pixels('liveD1'), posterior=pixels('liveD2');
      check(anterior.some((v,i)=>i%4===0 && v>30),'Anterior image must contain counts');
      check(posterior.some((v,i)=>i%4===0 && v>30),'Posterior image must contain counts');
      check(anterior.some((v,i)=>i%4===0 && v!==posterior[i]),'Opposite views differ');
      const initial=live.state.d1;
      check(live.state.d2.rawAngle===180,'Detector 2 must be opposed');
      for(let rot=0;rot<360;rot+=22.5){
        live.update({...state,rot});
        check(live.state.d1.rawAngle===rot,'Rotation must select the corresponding image');
        check(live.state.d2.rawAngle===(rot+180)%360,'Opposed detector rotates too');
      }
      live.update({...state,rot:90,tableZ:65});
      check(live.state.d1.segment==='Muslos','Table movement follows anatomy');
      check(live.state.d1.crop.y!==initial.crop.y,'Table movement changes crop');
      live.setZoom(2);
      check(live.state.d1.crop.h<initial.crop.h,'Zoom must narrow the field');
      live.setMatrix(128); check(live.state.d1.matrix===128,'128 matrix renders');
      live.setMatrix(256); check(live.state.d1.matrix===256,'256 matrix renders');
      live.update({...state,tableZ:-100});
      check(!pixels('liveD1').some((v,i)=>i%4===0 && v>0),'Outside body must be empty');
      return 'Angular mapping, two detectors, table movement, zoom, matrix and offline load OK';
    }""")
    for study in ["thyroid", "exploration", "parathyroid", "bone"]:
        page.select_option("#liveStudy", study)
        page.wait_for_function("GANTRY_LIVE.ready")
        state = page.evaluate("({study:GANTRY_LIVE.settings.study, count:GANTRY_LIVE.angles.length})")
        assert state == {"study": study, "count": 16 if study == "bone" else 40}, state
    assert not errors, errors
    browser.close()
    print(result)
    print("Existing studies and study switching OK; no JavaScript errors.")

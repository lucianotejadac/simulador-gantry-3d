"""Browser regression check: pip install playwright; requires Google Chrome.

La calidad de imagen (PSF y cuentas) debe depender de la distancia entre cada
cabezal y el paciente, no de la distancia al isocentro: subir la camilla acerca
al paciente al cabezal superior y lo aleja del inferior, exactamente igual que
acercar o retirar el propio cabezal.

Run: python tests/test_table_distance.py
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
      const near=(a,b,tol)=>Math.abs(a-b)<=tol;
      GANTRY_PATIENT3D.headFirst=false; GANTRY_ACQUISITION.headFirst=false;
      GANTRY_ACQUISITION.decubitus='supine';
      live.setCollimator('LEHR'); live.setEnergyCenter(140); live.setWindowWidth(20);
      live.setZoom(1); live.setMatrix(256);
      const base={...GANTRY.G,arms:'down',rot:0,tableZ:145,tableH:92,detDist1:30,detDist2:30};
      const read=s=>{live.update(s);return {d1:{...live.state.d1},d2:{...live.state.d2}};};

      const ref=read(base);
      check(ref.d1.gapSurface==='piel' && ref.d2.gapSurface==='piel','Con el paciente bajo el campo la distancia se mide a la piel');
      check(ref.d1.isoDistance===30 && ref.d2.isoDistance===30,'La distancia al isocentro se conserva como dato');
      check(ref.d1.effectiveDistance<30 && ref.d2.effectiveDistance<30,'La distancia a la piel es menor que al isocentro');

      // Subir la camilla 8 cm: D1 (arriba) se acerca 8 cm y D2 (abajo) se aleja 8 cm.
      const up=read({...base,tableH:100});
      check(near(up.d1.effectiveDistance,ref.d1.effectiveDistance-8,0.05),'Subir la camilla acerca al paciente a D1');
      check(near(up.d2.effectiveDistance,ref.d2.effectiveDistance+8,0.05),'Subir la camilla aleja al paciente de D2');
      check(up.d1.blur<ref.d1.blur && up.d1.counts>ref.d1.counts,'D1 gana nitidez y cuentas al subir la camilla');
      check(up.d2.blur>ref.d2.blur && up.d2.counts<ref.d2.counts,'D2 pierde nitidez y cuentas al subir la camilla');

      // Bajar la camilla 8 cm: la logica inversa.
      const down=read({...base,tableH:84});
      check(down.d1.blur>ref.d1.blur && down.d2.blur<ref.d2.blur,'Bajar la camilla invierte el efecto');

      // Misma logica para el cabezal: acercar D1 8 cm equivale a subir la camilla 8 cm.
      const head=read({...base,detDist1:22});
      check(near(head.d1.effectiveDistance,up.d1.effectiveDistance,1e-6),'Acercar el cabezal equivale a acercar la camilla');
      check(near(head.d1.blur,up.d1.blur,1e-9) && head.d1.counts===up.d1.counts,'Misma distancia, misma calidad');
      check(near(head.d2.effectiveDistance,ref.d2.effectiveDistance,1e-6),'Mover D1 no cambia la distancia de D2');

      // Cada cm cuenta hasta el contacto: no hay una meseta por debajo de 12 cm.
      const closer=read({...base,tableH:100,detDist1:29});
      check(closer.d1.blur<up.d1.blur,'La PSF sigue mejorando a pocos cm de la piel');

      // De lado (90 grados) la altura de la camilla no acerca ni aleja al paciente.
      const side=read({...base,rot:90}), sideUp=read({...base,rot:90,tableH:100});
      check(near(side.d1.effectiveDistance,sideUp.d1.effectiveDistance,1e-6),'En lateral la altura no cambia la distancia a la piel');

      // Sin nada bajo el campo se conserva la distancia al isocentro.
      const out=read({...base,tableZ:-100});
      check(out.d1.gapSurface===null && out.d1.effectiveDistance===30,'Campo libre: se usa la distancia al isocentro');
      return 'PSF y cuentas siguen la distancia cabezal–paciente: camilla y cabezal son equivalentes.';
    }""")
    assert not errors, errors
    browser.close()
    print(result)

"""Real browser: synthetic records, wrist attachment, picking, and exam-state isolation."""
from pathlib import Path
import json
import math
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT = Path(__file__).resolve().parents[1]
records = json.loads((ROOT / 'assets/clinical/patient-records.json').read_text(encoding='utf-8'))
assert len({p['rut'] for p in records['patients'].values()}) == 4
assert records['patients']['phantom']['label']=='john'
assert records['patients']['phantom']['givenNames']==['John','Andrés']
assert records['patients']['phantom']['surnames']==['FANTOMA','COMISION']
for p in records['patients'].values():
    assert len(p['givenNames']) == len(p['surnames']) == 2
    number, digit = p['rut'].replace('.', '').split('-')
    check = 11 - sum(int(c) * (2 + i % 6) for i, c in enumerate(number[::-1])) % 11
    assert digit == ('0' if check == 11 else 'K' if check == 10 else str(check))
    assert p['exams'] and p['order']['question']
    assert p['order']['exam']=='cintigrama oseo'

with serve_site() as url, sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width':1600, 'height':1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("window.GANTRY3D?.patientLoadState==='ready' && window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert", timeout=120000)
    assert page.locator('#boneProcessingTab').get_attribute('aria-selected')=='true'
    assert page.locator('#boneProcessingPane').is_visible()
    assert not page.locator('#acquisitionMenuButton').count()
    assert not page.get_by_role('button',name='Ver pulsera del paciente',exact=True).count()
    assert page.locator('#gantryPatient option').all_text_contents()==[p['label'] for p in records['patients'].values()]
    page.locator('#boneGantryTab').click()
    assert page.locator('#gantryLive').is_visible()
    page.locator('#boneProcessingTab').click()
    page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=false;Object.assign(GANTRY.G,{arms:'down',tableZ:-50,tableH:85,rot:0,detDist1:45,detDist2:45});GANTRY.render();GANTRY3D.view('iso');}")
    for patient_id, p in records['patients'].items():
        page.select_option('#gantryPatient', patient_id)
        page.wait_for_function('id=>GANTRY_PATIENT.id===id', arg=patient_id, timeout=60000)
        assert page.evaluate('GANTRY_PATIENT.metadata().name')==p['label']
        state = page.evaluate('JSON.stringify(GANTRY.G)')
        page.wait_for_timeout(500)
        page.mouse.click(*page.evaluate('GANTRY3D.wristband.placement().screen'))
        dialog = page.get_by_role('dialog')
        assert p['rut'] in dialog.inner_text()
        assert ' '.join(p['givenNames']) in dialog.inner_text()
        assert ' '.join(p['surnames']) in dialog.inner_text()
        if patient_id == 'caso-oseo':
            page.screenshot(path=str(ROOT.parent / 'gantry-patient-wristband.png'))
        page.keyboard.press('Escape')
        assert not dialog.is_visible()
        page.get_by_role('button', name='Abrir carpeta del paciente', exact=True).click()
        assert p['order']['exam'] in dialog.inner_text()
        assert p['rut'] in dialog.inner_text()
        page.get_by_role('button', name='Antecedentes y exámenes', exact=True).click()
        assert all(exam['title'] in dialog.inner_text() for exam in p['exams'])
        if patient_id == 'caso-oseo-3':
            page.screenshot(path=str(ROOT.parent / 'gantry-patient-record.png'))
        page.get_by_role('button', name='Cerrar ventana del paciente', exact=True).click()
        assert page.evaluate('JSON.stringify(GANTRY.G)') == state, 'Opening records must not move gantry'
        assert not page.evaluate('!!GANTRY_BONE_ACQ.active'), 'Records must not acquire'

    # The band stays 22 mm proximal to the posed wrist, with every posture/head direction.
    poses = page.evaluate("""()=>{
      const out=[];
      for(const arms of ['up','down'])for(const headFirst of [false,true]){
        GANTRY_PATIENT3D.headFirst=headFirst;
        Object.assign(GANTRY.G,{arms,tableZ:-50,tableH:85,rot:0,detDist1:45,detDist2:45});GANTRY.render();
        out.push({arms,headFirst,...GANTRY3D.wristband.placement()});
      }
      return out;
    }""")
    for pose in poses:
        assert abs(math.dist(pose['world'], pose['wrist']) - .022) < 1e-5, pose
    assert len({tuple(round(x,3) for x in p['world']) for p in poses}) == 4, poses
    page.evaluate("""()=>{
      GANTRY_PATIENT3D.headFirst=false;
      GANTRY.G.arms='down';GANTRY.render();GANTRY3D.view('iso');
    }""")
    page.wait_for_timeout(800)
    band = page.evaluate('GANTRY3D.wristband.placement()')
    page.screenshot(path=str(ROOT.parent / 'gantry-wristband-3d.png'))
    print('BAND', band, flush=True)
    page.mouse.click(*band['screen'])
    assert page.get_by_role('dialog').is_visible(), 'Clicking the 3D wristband must open its identification'
    page.keyboard.press('Escape')
    page.mouse.move(*band['screen'])
    page.mouse.down()
    page.mouse.move(band['screen'][0]+20,band['screen'][1]+20,steps=4)
    page.mouse.up()
    assert not page.get_by_role('dialog').is_visible(), 'Dragging is not a bracelet click'
    # The tutorial's room gestures change the camera without moving the patient/equipment.
    page.locator('[data-g3dview="iso"]').click()
    page.wait_for_timeout(500)
    geometry=page.evaluate('JSON.stringify(GANTRY.G)')
    rect=page.locator('#g3dStage').bounding_box()
    x,y=rect['x']+rect['width']*.65,rect['y']+rect['height']*.72
    for gesture in ['rotate','pan','zoom']:
        before=page.evaluate('GANTRY3D.wristband.placement().screen')
        page.mouse.move(x,y)
        if gesture=='zoom':page.mouse.wheel(0,-150)
        else:
            button='left' if gesture=='rotate' else 'right'
            page.mouse.down(button=button)
            page.mouse.move(x+45,y+20,steps=8)
            page.mouse.up(button=button)
        page.wait_for_timeout(500)
        after=page.evaluate('GANTRY3D.wristband.placement().screen')
        assert math.dist(before,after)>1,(gesture,before,after)
        assert page.evaluate('JSON.stringify(GANTRY.G)')==geometry
    page.locator('#roomOverview').click()
    assert not errors, errors
    print('OK: four unique synthetic identities, dossiers, modal keyboard/close, scene picking, four poses, unchanged exam state.')
    browser.close()

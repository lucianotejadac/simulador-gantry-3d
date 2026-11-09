"""Spotlight across iframe coordinates and confirmed correction of pending identity."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1050})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert",timeout=120000)
    page.locator('#acquisitionTutorialOpen').click()
    page.select_option('#acquisitionTutorialStep','0')
    assert 'ahora no necesitas anotarlos' in page.locator('#acquisitionTutorialBody').inner_text()
    assert 'deliberadamente «cintigrama oseo»' in page.locator('#acquisitionTutorialBody').inner_text()
    assert 'botón derecho' in page.locator('#acquisitionTutorialBody').inner_text()
    page.get_by_role('button',name='Señalar Paciente',exact=True).click()
    page.locator('#acquisitionTutorialSpotlight').wait_for()
    page.locator('#acquisitionTutorialPanel').wait_for(state='hidden')
    head=page.locator('#acquisitionTutorialSpotlight > path').last
    a=head.get_attribute('transform');page.wait_for_timeout(130);assert a!=head.get_attribute('transform')
    page.screenshot(path=str(ROOT.parent/'gantry-tutorial-spotlight.png'))
    page.select_option('#gantryPatient','caso-oseo')
    page.wait_for_function("GANTRY_PATIENT.id==='caso-oseo'",timeout=60000)
    page.locator('#boneProcessingTab').click()
    assert not page.locator('#acquisitionTutorialSpotlight').count()
    frame=page.frame_locator('#boneProcessingFrame')
    frame.locator('#processingAcquireMenu').select_option('static')
    page.locator('#patientRegistration').wait_for()
    assert not page.locator('#registrationViewBand').count()
    assert not page.locator('#patientRegistration').evaluate('(n)=>n.matches(":modal")')
    page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=false;Object.assign(GANTRY.G,{arms:'down',tableZ:-50,tableH:85,rot:0,detDist1:45,detDist2:45});GANTRY.render();GANTRY3D.view('iso');}")
    page.wait_for_timeout(500)
    page.mouse.click(*page.evaluate('GANTRY3D.wristband.placement().screen'))
    band=page.locator('#patientBandLayer');band.wait_for()
    def inside(a,b):
        return a['x']>=b['x']-1 and a['y']>=b['y']-1 and a['x']+a['width']<=b['x']+b['width']+1 and a['y']+a['height']<=b['y']+b['height']+1
    assert inside(band.bounding_box(),page.locator('#g3dStage').bounding_box())
    assert 'Matías Ignacio'.upper() in page.locator('.patient-band-label').inner_text().upper()
    page.keyboard.press('Escape')
    band.wait_for(state='hidden')
    assert page.locator('#patientRegistration').is_visible(), 'Closing the wristband must retain the registration'
    page.mouse.click(*page.evaluate('GANTRY3D.wristband.placement().screen'))
    band.wait_for()
    # The bracelet stays visible while the registration form is filled.
    for key,value in {'fullName':'Matías Ignacio Fuentes Araya','rut':'91.000.002-0','examName':'Cintigrafía ósea'}.items():
        page.locator('#registration-'+key).fill(value)
    page.screenshot(path=str(ROOT.parent/'gantry-registration-bracelet.png'))
    page.locator('#patientRegistrationSave').click()
    frame.locator('#gantryDraft-matrix').wait_for()
    assert band.is_hidden()
    first=page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')
    frame.locator('#gantryDraft-matrix').select_option('128')
    frame.locator('#gantryDraft-zoom').select_option('1.5')
    # Another pending acquisition must share the corrected identification.
    frame.locator('#processingAcquireMenu').select_option('whole')
    frame.locator('#gantryDraft-velocity').wait_for(state='attached')
    frame.locator('#tab-series').click()
    edit=frame.get_by_role('button',name='Modificar datos: Nombre completo',exact=True)
    edit.click();page.locator('#patientRegistrationConfirm').wait_for()
    page.locator('#registrationEditCancel').click()
    assert page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')==first
    edit.click();page.locator('#registrationEditConfirm').click()
    page.locator('#patientRegistration').wait_for()
    assert page.locator('#registration-fullName').input_value()==first['fullName']
    page.locator('#registration-examName').fill('No guardar')
    page.locator('#patientRegistrationCancel').click()
    assert page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')==first
    edit.click();page.locator('#registrationEditConfirm').click()
    page.locator('#registration-examName').fill('Cintigrafía ósea trifásica')
    page.locator('#patientRegistrationSave').click()
    frame.locator('#series input[data-label="Nombre del examen"]').wait_for()
    page.wait_for_function("GANTRY_PATIENT_REGISTRATION.current().examName==='Cintigrafía ósea trifásica'")
    assert frame.locator('#tab-series').get_attribute('aria-selected')=='true'
    assert frame.locator('#patient input').nth(1).input_value()=='Cintigrafía ósea trifásica'
    frame.locator('.acquisition-tabs button[data-acquisition-number]').nth(0).click()
    assert frame.locator('#patient input').nth(1).input_value()=='Cintigrafía ósea trifásica'
    frame.locator('#tab-camera').click()
    assert frame.locator('#gantryDraft-matrix').input_value()=='128'
    assert frame.locator('#gantryDraft-zoom').input_value()=='1.5'
    # Spotlight in the embedded viewer must leave a hole at the real control.
    page.locator('#acquisitionTutorialOpen').click();page.select_option('#acquisitionTutorialStep','3')
    page.get_by_role('button',name='Señalar Parámetros de cámara',exact=True).click()
    page.locator('#acquisitionTutorialPanel').wait_for(state='hidden')
    page.locator('#acquisitionTutorialSpotlight rect').wait_for()
    target=frame.locator('#gantryDraft-matrix').bounding_box()
    hole=page.locator('#acquisitionTutorialSpotlight rect').bounding_box()
    assert inside(target,hole),(target,hole)
    assert hole['width']<target['width']+25 and hole['height']<target['height']+25
    page.screenshot(path=str(ROOT.parent/'gantry-tutorial-spotlight-frame.png'))
    # Scroll follows; clicking the target dismisses the dimming without swallowing it.
    frame.locator('#gantryDraft-matrix').click()
    assert not page.locator('#acquisitionTutorialSpotlight').count()
    page.keyboard.press('Escape')
    # Reduced motion preserves the spotlight and endpoint arrow without travel.
    page.emulate_media(reduced_motion='reduce')
    page.locator('#acquisitionTutorialOpen').click()
    page.get_by_role('button',name='Señalar Cámara en vivo',exact=True).click()
    page.locator('#acquisitionTutorialSpotlight').wait_for()
    page.wait_for_timeout(80)
    transform=head.get_attribute('transform');page.wait_for_timeout(130)
    assert head.get_attribute('transform')==transform
    page.keyboard.press('Escape')
    assert not page.locator('#acquisitionTutorialSpotlight').count()
    # Acquired identity remains an immutable snapshot after a later correction.
    frame.locator('#gantryDraft-study').select_option('bone')
    frame.locator('#gantryDraft-collimator').select_option('LEHR')
    frame.locator('#gantryDraft-energyCenter').fill('140');frame.locator('#gantryDraft-energyCenter').press('Tab')
    frame.locator('#gantryDraft-windowWidth').select_option('20')
    page.evaluate("()=>{GANTRY_RF.configure(20,120,'mCi');Object.assign(GANTRY.G,{tableZ:128,tableH:85,detDist1:45,detDist2:45});GANTRY.render();}")
    frame.locator('#tab-stop').click();frame.locator('#gantryDraft-mode').select_option('time');frame.locator('#gantryDraft-target').fill('2')
    frame.locator('[data-acquire="instant"]').click()
    page.wait_for_function('GANTRY_BONE_ACQ.state?.finished',timeout=60000)
    child=page.locator('#boneProcessingFrame').element_handle().content_frame()
    child.wait_for_function("document.body.classList.contains('gantry-acquisition-frozen')",timeout=30000)
    acquired=page.evaluate('GANTRY_BONE_ACQ.processingCurrent().patient')
    assert not frame.locator('.registration-edit').count()
    frame.locator('.acquisition-tabs button[data-acquisition-number]').nth(1).click()
    frame.get_by_role('button',name='Modificar datos: Paciente',exact=True).click()
    page.locator('#registrationEditConfirm').click()
    page.locator('#registration-examName').fill('Control de pies y tobillos')
    page.locator('#patientRegistrationSave').click()
    page.wait_for_function("GANTRY_PATIENT_REGISTRATION.current().examName==='Control de pies y tobillos'")
    assert page.evaluate('GANTRY_BONE_ACQ.processingCurrent().patient')==acquired
    frame.locator('.acquisition-tabs button[data-acquisition-number]').nth(0).click()
    assert frame.locator('#patient input').nth(1).input_value()==acquired['examName']
    assert not errors,errors
    print('OK: bracelet during registration; confirm/cancel/edit across pending acquisitions; frozen identity preserved; parent/iframe spotlights, comet, interaction and reduced motion.')
    browser.close()

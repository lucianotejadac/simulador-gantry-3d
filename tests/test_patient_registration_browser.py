"""First-acquisition registration, cancellation, reuse and saved-image metadata."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
person={'fullName':'John Andrés FANTOMA COMISION','rut':'91.000.001-2','examName':'Cintigrafía ósea de control'}

with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    for kind in ['static','whole','dynamic']:
        page=browser.new_page(viewport={'width':1600,'height':1050})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert",timeout=120000)
        page.evaluate("()=>{GANTRY_RF.select('bone');GANTRY_RF.configure(20,120,'mCi');GANTRY_LIVE.setMatrix(128);GANTRY_LIVE.setZoom(1);GANTRY_LIVE.setCollimator('LEHR');GANTRY_LIVE.setEnergyCenter(140);GANTRY_LIVE.setWindowWidth(20);}")
        page.locator('#boneProcessingTab').click()
        page.locator('#boneProcessingFrame').wait_for()
        frame=page.frame_locator('#boneProcessingFrame')
        menu=frame.locator('#processingAcquireMenu');menu.wait_for()
        child=page.locator('#boneProcessingFrame').element_handle().content_frame()
        frame.locator('#mode-flex').click()
        assert not frame.locator('#header-dialog, #flex-add-header, #flex-context-header').count()
        assert child.evaluate('flexPage().header') is None
        menu.select_option(kind)
        dialog=page.locator('#patientRegistration');dialog.wait_for()
        assert dialog.locator('input').count()==3
        assert not page.locator('#registration-birthDate').count()
        assert not frame.locator('[id^="gantryDraft-"]').count()
        page.locator('#patientRegistrationSave').click()
        assert 'nombre completo' in page.locator('#patientRegistrationError').inner_text()
        page.locator('#patientRegistrationCancel').click()
        page.wait_for_function("!document.getElementById('boneProcessingFrame').contentDocument.getElementById('processingAcquireMenu').disabled")
        assert not page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')
        assert page.evaluate('GANTRY_LIVE.settings.zoom')==1
        assert page.evaluate('GANTRY_RF.selected')=='bone'
        assert not frame.locator('[id^="gantryDraft-"]').count()

        menu.select_option(kind);dialog.wait_for()
        for key,value in person.items():page.locator('#registration-'+key).fill(value)
        page.locator('#registration-rut').fill('91.000.001-0');page.locator('#patientRegistrationSave').click()
        assert 'verificador' in page.locator('#patientRegistrationError').inner_text()
        page.locator('#registration-rut').fill(person['rut'])
        if kind=='static':page.screenshot(path=str(ROOT.parent/'gantry-patient-registration.png'))
        page.locator('#patientRegistrationSave').click();dialog.wait_for(state='hidden')
        frame.locator('#gantryDraft-matrix').wait_for()
        assert frame.locator('#patient input').nth(0).input_value()==person['fullName']
        assert frame.locator('#patient input').nth(1).input_value()==person['examName']
        initial=page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')
        assert all(initial[k]==v for k,v in person.items())
        assert 'birthDate' not in initial
        frame.locator('#mode-flex').click()
        header=child.evaluate('flexPage().header')
        assert header['patient']['value']==person['fullName'],header
        assert header['rut']['value']==person['rut'],header
        assert header['exam']['value']==person['examName'],header
        assert header['date']['value'],header
        assert child.evaluate('flexPage().items.length')==0
        frame.locator('#flex-add').click()
        assert child.evaluate('flexPage().header')==header
        # Return to the pending acquisition; there is no second identity form.
        frame.locator('.acquisition-tabs [data-acquisition-number="1"]').click()
        frame.locator('#tab-series').click()
        assert frame.locator('#series input[data-label="RUT"]').input_value()==person['rut']
        assert not frame.locator('#series input[data-label="Fecha de nacimiento"]').count()
        # Adding another type reuses the same registration, even before taking images.
        menu.select_option('whole' if kind!='whole' else 'static')
        page.wait_for_function("!document.getElementById('boneProcessingFrame').contentDocument.getElementById('processingAcquireMenu').disabled")
        assert not dialog.is_visible()
        assert page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')==initial
        if kind=='static':
            # Real instant acquisition carries the entered identity through DICOM and the frozen form.
            menu.select_option('static')
            frame.locator('#tab-stop').click()
            frame.locator('#gantryDraft-mode').select_option('time');frame.locator('#gantryDraft-target').fill('2')
            page.evaluate("()=>{GANTRY.G.tableZ=128;GANTRY.G.tableH=85;GANTRY.G.detDist1=45;GANTRY.G.detDist2=45;GANTRY.render();}")
            page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=120000)
            frame.locator('[data-acquire="instant"]').click()
            page.wait_for_function('GANTRY_BONE_ACQ.state?.finished',timeout=60000)
            saved=page.evaluate('GANTRY_BONE_ACQ.processingCurrent().patient')
            assert all(saved[k]==v for k,v in person.items()),saved
            child.wait_for_function("document.body.classList.contains('gantry-acquisition-frozen')",timeout=30000)
            tags=child.evaluate("()=>({name:value(dataset,'00100010'),rut:value(dataset,'00100020'),birth:value(dataset,'00100030'),exam:value(dataset,'00081030')})")
            assert tags==dict(name=person['fullName'],rut=person['rut'],birth='',exam=person['examName']),tags
            assert frame.locator('#patient input').nth(1).input_value()==person['examName']
            frame.locator('#mode-flex').click()
            frame.locator('#flex-add-images').click()
            frame.locator('#flex-pick-all').check()
            frame.locator('#flex-pick-submit').click()
            assert child.evaluate('flexPage().items.length')==2
            recorded=child.evaluate('flexPage().header')
            assert recorded['patient']['value']==tags['name']
            assert recorded['rut']['value']==tags['rut']
            assert recorded['exam']['value']==tags['exam']
            assert recorded['date']['value']==child.evaluate('flexPage().meta.date')
            with page.expect_download() as download:
                frame.locator('#flex-export').click()
            assert download.value.failure() is None
            page.screenshot(path=str(ROOT.parent/'gantry-flexible-automatic-header.png'))
            page.select_option('#gantryPatient','caso-oseo-2')
            page.wait_for_function("GANTRY_PATIENT.id==='caso-oseo-2'",timeout=60000)
            child.wait_for_function('flex.header===null')
            assert child.evaluate('flexPage().header')==recorded,'Patient changes must not relabel acquired images'
            frame.locator('#flex-add').click()
            assert child.evaluate('flexPage().header') is None,'An unregistered patient must not inherit another header'
            menu.select_option('dynamic');dialog.wait_for()
            assert not page.locator('#registration-fullName').input_value()
            page.keyboard.press('Escape');dialog.wait_for(state='hidden')
            assert page.evaluate('GANTRY_BONE_ACQ.processingCurrent().patient')==saved
            page.select_option('#gantryPatient','phantom')
            page.wait_for_function("GANTRY_PATIENT.id==='phantom'")
            menu.select_option('dynamic')
            page.wait_for_function("!document.getElementById('boneProcessingFrame').contentDocument.getElementById('processingAcquireMenu').disabled")
            assert not dialog.is_visible()
            assert page.evaluate('GANTRY_PATIENT_REGISTRATION.current()')==initial
        assert not errors,errors
        print('OK:',kind,'first registration, validation, cancel, reuse and patient isolation.',flush=True)
        page.close()
    # The old Gantry acquisition entry is covered too; cancellation does not start it.
    page=browser.new_page();page.goto(url)
    page.wait_for_function("window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert",timeout=120000)
    page.evaluate("GANTRY_RF.select('bone')")
    page.wait_for_function("!document.getElementById('boneAcqStart').disabled",timeout=60000)
    page.evaluate("document.getElementById('boneAcqStart').click()")
    page.locator('#patientRegistration').wait_for()
    page.keyboard.press('Escape')
    assert not page.evaluate('GANTRY_BONE_ACQ.active')
    print('OK: legacy Gantry acquisition also requests identification.')
    browser.close()

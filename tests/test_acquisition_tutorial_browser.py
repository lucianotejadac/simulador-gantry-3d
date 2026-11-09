"""Real tutorial path: three phases with late whole-body, four pages and exports."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site

ROOT=Path(__file__).resolve().parents[1]
with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1050},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert",timeout=120000)
    before=page.evaluate('JSON.stringify(GANTRY_LIVE.settings)')
    page.locator('#acquisitionTutorialOpen').click()
    page.locator('#acquisitionTutorialNext').click()
    assert page.evaluate('JSON.stringify(GANTRY_LIVE.settings)')==before
    assert not page.evaluate('GANTRY_BONE_ACQ.active')
    page.select_option('#acquisitionTutorialStep','0')
    page.locator('#acquisitionTutorialPanel').screenshot(path=str(ROOT.parent/'gantry-tutorial-panel.png'))
    page.get_by_role('button',name='Señalar Paciente',exact=True).click()
    page.locator('#gantryPatient.acquisition-tutorial-highlight').wait_for()
    page.locator('#acquisitionTutorialPanel').wait_for(state='hidden')
    page.select_option('#gantryPatient','caso-oseo')
    page.wait_for_function("GANTRY_PATIENT.id==='caso-oseo'",timeout=60000)
    page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=false;Object.assign(GANTRY.G,{arms:'down',tableZ:-50,tableH:85,rot:0,detDist1:45,detDist2:45});GANTRY.render();GANTRY3D.view('iso');}")
    page.wait_for_timeout(500)
    page.mouse.click(*page.evaluate('GANTRY3D.wristband.placement().screen'))
    page.get_by_role('button',name='Cerrar ventana del paciente',exact=True).click()
    page.get_by_role('button',name='Abrir carpeta del paciente',exact=True).click()
    page.get_by_role('button',name='Cerrar ventana del paciente',exact=True).click()
    page.locator('#boneProcessingTab').click()
    frame=page.frame_locator('#boneProcessingFrame')
    frame.locator('#processingAcquireMenu').select_option('dynamic')
    page.locator('#patientRegistration').wait_for()
    for key,value in {'fullName':'Matías Ignacio FANTOMA COMISION','rut':'91.000.002-0','examName':'Cintigrafía ósea trifásica'}.items():
        page.locator('#registration-'+key).fill(value)
    page.locator('#patientRegistrationSave').click()
    frame.locator('#gantryDraft-matrix').wait_for()
    child=page.locator('#boneProcessingFrame').element_handle().content_frame()
    child.wait_for_function('!!window.GANTRY_TUTORIAL_VIEW')
    page.wait_for_function("GANTRY_RF.selected==='bone3' && GANTRY_RF.pending()")
    page.select_option('#rfUnit','mCi');page.locator('#rfDose').fill('20');page.locator('#rfDose').press('Tab')
    page.locator('#rfTime').fill('0');page.locator('#rfTime').press('Tab')
    # Known clear physical placement, identical to the established case browser test.
    page.evaluate("""()=>{GANTRY_PATIENT3D.headFirst=false;GANTRY_ACQUISITION.headFirst=false;GANTRY_ACQUISITION.decubitus='supine';Object.assign(GANTRY.G,{arms:'down',rot:0,tableZ:25,tableH:85,detDist1:45,detDist2:45});GANTRY.render();}""")
    page.locator('#acquisitionTutorialOpen').click();page.select_option('#acquisitionTutorialStep','2')
    page.locator('.tutorial-visual-check input').check()
    page.locator('#acquisitionTutorialMinimize').click()
    frame.locator('#gantryDraft-matrix').select_option('64');frame.locator('#gantryDraft-matrix').select_option('128')
    frame.locator('#gantryDraft-zoom').select_option('1.5');frame.locator('#gantryDraft-zoom').select_option('1')
    frame.locator('#gantryDraft-collimator').select_option('LEHR')
    frame.locator('#gantryDraft-energyCenter').fill('140');frame.locator('#gantryDraft-energyCenter').press('Tab')
    frame.locator('#gantryDraft-windowWidth').select_option('20')
    page.locator('#acquisitionTutorialOpen').click();page.select_option('#acquisitionTutorialStep','3')
    page.get_by_role('button',name='Señalar Cámara en vivo',exact=True).click()
    page.locator('#liveCameraSettings.acquisition-tutorial-highlight').wait_for()
    assert page.locator('#liveCameraDetails').get_attribute('open') is not None
    page.locator('#acquisitionTutorialOpen').click()
    page.get_by_role('button',name='Señalar Condiciones de paro',exact=True).click()
    frame.locator('#gantryDraft-phaseFrames0.acquisition-tutorial-highlight').wait_for()
    frame.locator('#tab-stop').click()
    frame.locator('#gantryDraft-name1').fill('Flujo · D1');frame.locator('#gantryDraft-name2').fill('Flujo · D2')
    page.wait_for_function('GANTRY_ACQUISITION_TUTORIAL.snapshot().seen.protocol')
    page.locator('#rfInject').click()
    assert not page.evaluate('GANTRY_BONE_ACQ.active')
    frame.locator('[data-acquire="start"]').click()
    page.wait_for_function('GANTRY_BONE_ACQ.active',timeout=30000)
    # Exercise real frames, then finish through the existing instantaneous path.
    frame.locator('[data-acquire="instant"]').click()
    page.wait_for_function('GANTRY_BONE_ACQ.state?.finished',timeout=120000)
    child.wait_for_function('GANTRY_TUTORIAL_VIEW.snapshot().records.length===1',timeout=60000)
    frame.locator('#dyn-next').click()
    print('OK: dynamic registered and acquired.',flush=True)
    for phase,kind,minutes,mode,target in [('Pool','static',3,'time','180'),('Cuerpo completo tardío','whole',180,None,None),('Tardía','static',None,'counts','200000')]:
        frame.locator('#processingAcquireMenu').select_option(kind)
        frame.locator('#gantryDraft-matrix').wait_for()
        frame.locator('#gantryDraft-matrix').select_option('256')
        frame.locator('#gantryDraft-zoom').select_option('1' if kind=='whole' else '1.75')
        if minutes is not None:
            page.locator('#rfTime').fill(str(minutes));page.locator('#rfTime').press('Tab')
        # Start whole-body at the skull, then return to the feet for directed views.
        page.evaluate('(z)=>{GANTRY.G.tableZ=z;GANTRY.render();}',200 if kind=='whole' else 25)
        frame.locator('#tab-stop').click()
        if kind=='whole':
            frame.locator('#gantryDraft-velocity').fill('10')
            frame.locator('#gantryDraft-contours').select_option('auto')
            assert frame.locator('#gantryDraft-target').count()==0
        else:
            frame.locator('#gantryDraft-mode').select_option(mode);frame.locator('#gantryDraft-target').fill(target)
        frame.locator('#gantryDraft-name1').fill(phase+' · D1');frame.locator('#gantryDraft-name2').fill(phase+' · D2')
        page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=60000)
        count=child.evaluate('GANTRY_TUTORIAL_VIEW.snapshot().records.length')
        if kind=='whole':
            # Physical posture must be checked even when the declared position is correct.
            page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=true;GANTRY.render();}")
            for action in ['start','instant']:
                child.evaluate("document.getElementById('status-text').textContent=''")
                frame.locator('[data-acquire="'+action+'"]').click()
                child.wait_for_function("document.getElementById('status-text').textContent.includes('requiere al paciente en supino')",timeout=60000)
                assert not page.evaluate('GANTRY_BONE_ACQ.active')
                assert child.evaluate('GANTRY_TUTORIAL_VIEW.snapshot().records.length')==count
                assert page.evaluate('GANTRY.G.tableZ')==200
                assert page.evaluate('GANTRY_PATIENT3D.headFirst') is True
            page.evaluate("()=>{GANTRY_PATIENT3D.headFirst=false;GANTRY.render();}")
            print('OK: normal and instant whole-body reject head-in without moving the patient.',flush=True)
        frame.locator('[data-acquire="instant"]').click()
        child.wait_for_function('n=>GANTRY_TUTORIAL_VIEW.snapshot().records.length===n',arg=count+1,timeout=120000)
        if kind=='whole':
            whole=child.evaluate("GANTRY_TUTORIAL_VIEW.snapshot().records.find(r=>r.acquisition.kind==='whole')")
            assert whole['scan']['startZ']==200 and whole['scan']['travel']>=175
            assert whole['scan']['physicalPosition']=={'decubitus':'supine','headFirst':False}
            assert whole['heads'][0]['total']>0 and whole['heads'][1]['total']>0
            assert page.evaluate('GANTRY_TUTORIAL_MODEL.phases(GANTRY_ACQUISITION_TUTORIAL.snapshot().viewer.records).whole.length')==1
            assert not page.evaluate('GANTRY_TUTORIAL_MODEL.phases(GANTRY_ACQUISITION_TUTORIAL.snapshot().viewer.records).delayed.length')
        elif phase=='Tardía':
            late=child.evaluate("GANTRY_TUTORIAL_VIEW.snapshot().records.filter(r=>r.acquisition.kind==='static').at(-1)")
            assert late['administration']['seconds']>=whole['administration']['seconds']+1050,'Keep the same injection clock after the 175 cm scan at 10 cm/min'
        print('OK:',phase,'acquired.',flush=True)
    frame.locator('[aria-controls="analysisPanel"]').click()
    frame.locator('#analysisWindow').fill('200');frame.locator('#analysisWindow').press('Tab')
    frame.locator('#analysisInvert').check()
    state=page.evaluate('GANTRY_ACQUISITION_TUTORIAL.snapshot()')
    checks=page.evaluate('GANTRY_TUTORIAL_MODEL.evaluate(GANTRY_ACQUISITION_TUTORIAL.snapshot())')
    assert len(checks)==11
    assert all(c['done'] for group in checks[:9] for c in group),checks[:9]
    assert not checks[9][1]['done'],'No images are added by the tutorial'
    frame.locator('#mode-flex').click()
    child.wait_for_function("document.body.classList.contains('flex-mode')")
    assert child.evaluate('flex.pages.every(p=>p.items.length===0)')
    # Real picker: flow per detector, pool/directed static views, then paired whole-body.
    groups=child.evaluate("[flex.assets.filter(a=>a.kind==='dynamic').slice(0,1).map(a=>a.id),flex.assets.filter(a=>a.kind==='dynamic').slice(1,2).map(a=>a.id),flex.assets.filter(a=>a.kind==='static').map(a=>a.id),flex.assets.filter(a=>a.kind==='whole').map(a=>a.id)]")
    assert list(map(len,groups))==[1,1,4,2],groups
    for i,ids in enumerate(groups):
        if i:frame.locator('#flex-add').click()
        frame.locator('#flex-add-images').click()
        for id in ids:frame.locator('#flex-picker-list input').evaluate_all('(nodes,id)=>{const n=nodes.find(n=>n.value===id);if(!n)throw Error("Image not in picker");n.click();}',id)
        frame.locator('#flex-pick-submit').click()
        frame.locator('#flex-arrange').click()
        with page.expect_download() as download:frame.locator('#flex-export').click()
        assert download.value.suggested_filename.endswith('.png')
        if i==2:
            assert not page.evaluate("GANTRY_TUTORIAL_MODEL.evaluate(GANTRY_ACQUISITION_TUTORIAL.snapshot()).flat().find(c=>c.id==='images').done"),'The whole-body page is still missing'
    checks=page.evaluate('GANTRY_TUTORIAL_MODEL.evaluate(GANTRY_ACQUISITION_TUTORIAL.snapshot())')
    assert all(c['done'] for group in checks for c in group),checks
    # A layout change invalidates that page's export check.
    child.evaluate('flexPage().items[0].x+=1')
    assert not page.evaluate("GANTRY_TUTORIAL_MODEL.evaluate(GANTRY_ACQUISITION_TUTORIAL.snapshot()).flat().find(c=>c.id==='export').done")
    frame.locator('#processingFileMenu').select_option('acquisition-tutorial')
    page.locator('#acquisitionTutorialPanel').wait_for()
    page.select_option('#acquisitionTutorialStep','9')
    assert page.locator('#acquisitionTutorialProgress').get_attribute('max')=='11'
    assert 'Cuatro páginas' in page.locator('#acquisitionTutorialBody').inner_text()
    page.screenshot(path=str(ROOT.parent/'gantry-tutorial-flexible.png'))
    page.locator('#acquisitionTutorialMinimize').click()
    for width,height in [(1600,1000),(1280,900),(700,900)]:
        page.set_viewport_size({'width':width,'height':height})
        page.locator('#acquisitionTutorialOpen').click()
        box=page.locator('#acquisitionTutorialPanel').bounding_box()
        assert box['x']>=0 and box['x']+box['width']<=width and box['y']>=0 and box['y']+box['height']<=height,box
        page.locator('#acquisitionTutorialMinimize').click()
    assert not errors,errors
    print('OK: three phases including full late whole-body, four pages, PNGs and responsive guide.',flush=True)
    browser.close()

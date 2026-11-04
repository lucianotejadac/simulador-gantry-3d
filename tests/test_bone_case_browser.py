"""Patient selection, acquisition identity and real rendering integration."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
from serve_site import serve_site
ROOT=Path(__file__).resolve().parents[1]
CASE=os.environ.get('GANTRY_TEST_CASE','caso-oseo')
with serve_site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert",timeout=120000)
    page.select_option('#gantryPatient',CASE)
    page.wait_for_function("id=>GANTRY_PATIENT.id===id",arg=CASE,timeout=30000)
    page.evaluate("""()=>{
      GANTRY_RF.select('bone');GANTRY_RF.configure(20,120,'mCi');
      GANTRY_PATIENT3D.headFirst=false;GANTRY_ACQUISITION.headFirst=false;GANTRY_ACQUISITION.decubitus='supine';
      Object.assign(GANTRY.G,{arms:'down',rot:0,tableZ:25,tableH:85,detDist1:45,detDist2:45});GANTRY.render();
      GANTRY_LIVE.setMatrix(128);GANTRY_LIVE.setZoom(1);GANTRY_LIVE.setEnergyCenter(140);GANTRY_LIVE.setWindowWidth(20);GANTRY_LIVE.setCollimator('LEHR');
    }""")
    if CASE=='caso-oseo-3':
        page.evaluate("()=>{GANTRY.G.tableZ=128;GANTRY.render();}")
    page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=120000)
    page.evaluate("""()=>GANTRY_BONE_ACQ.startConfigured({kind:'static',mode:'time',target:10,velocity:10,names:['Detector 1','Detector 2']})""")
    blocked=page.evaluate("async()=>{try{await GANTRY_PATIENT.select('phantom');return false;}catch(e){return true;}}")
    assert blocked
    page.evaluate("()=>GANTRY_BONE_ACQ.controlFromProcessing('instant')")
    page.wait_for_function('GANTRY_BONE_ACQ.state.finished',timeout=60000)
    record=page.evaluate("()=>{const r=GANTRY_BONE_ACQ.processingCurrent();return {patient:r.patient,totals:r.heads.map(h=>h.total),id:r.id}}")
    assert record['patient']['id']==CASE and min(record['totals'])>0,record
    page.evaluate("()=>GANTRY_PATIENT.select('phantom')")
    assert page.evaluate('GANTRY_BONE_ACQ.processingCurrent().patient.id')==CASE
    page.evaluate("id=>GANTRY_PATIENT.select(id)",CASE)
    page.evaluate("()=>{GANTRY_RF.select('bone3');GANTRY_RF.inject();}")
    assert not page.evaluate('GANTRY_BONE_ACQ.active'),'Injection must not acquire'
    page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=60000)
    page.evaluate("()=>GANTRY_BONE_ACQ.startConfigured({kind:'dynamic',mode:'time',target:20,phases:[{frames:10,seconds:2}],velocity:10,names:['D1','D2']})")
    page.evaluate("()=>GANTRY_BONE_ACQ.controlFromProcessing('instant')")
    dynamic=page.evaluate("()=>{const r=GANTRY_BONE_ACQ.processingCurrent();return {patient:r.patient,frames:r.dynamic.frames.length,total:r.heads[0].total}}")
    assert dynamic['frames']==10 and dynamic['total']>0 and dynamic['patient']['id']==CASE,dynamic
    page.evaluate("()=>{GANTRY_RF.select('bone');GANTRY_RF.configure(20,120,'mCi');GANTRY.G.tableZ=200;GANTRY.render();}")
    page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=60000)
    page.evaluate("()=>GANTRY_BONE_ACQ.startConfigured({kind:'whole',mode:'counts',target:400000,velocity:60,contours:'fixed',names:['D1','D2']})")
    page.evaluate("()=>GANTRY_BONE_ACQ.controlFromProcessing('instant')")
    whole=page.evaluate("()=>{const r=GANTRY_BONE_ACQ.processingCurrent();return {patient:r.patient,kind:r.kind,finished:r.finished,total:r.heads[0].total}}")
    assert whole['kind']=='whole' and whole['finished'] and whole['total']>0 and whole['patient']['id']==CASE,whole
    if CASE=='caso-oseo-3':
        # A targeted oblique acquisition must work with raised arms as well.
        page.evaluate("()=>{Object.assign(GANTRY.G,{arms:'up',rot:45,tableZ:128});GANTRY.render();}")
        page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing',timeout=120000)
        page.evaluate("()=>GANTRY_BONE_ACQ.startConfigured({kind:'static',mode:'time',target:10,velocity:10,names:['D1','D2']})")
        page.evaluate("()=>GANTRY_BONE_ACQ.controlFromProcessing('instant')")
        oblique=page.evaluate("()=>{const r=GANTRY_BONE_ACQ.processingCurrent();return {patient:r.patient,total:r.heads[0].total}}")
        assert oblique['total']>0 and oblique['patient']['id']==CASE,oblique
    page.screenshot(path=str(ROOT.parent/('gantry-'+CASE+'.png')))
    assert not errors,errors
    print('OK: selector, acquired counts, immutable patient identity, blocked mid-acquisition switch.',record)
    browser.close()

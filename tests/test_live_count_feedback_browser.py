"""Exercise real independent-event feedback: matrix, energy window and persistence."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from serve_site import serve_site

with serve_site() as url, sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("window.GANTRY_LIVE?.ready && !document.getElementById('gantryWin').inert", timeout=120000)
    page.evaluate("""() => {
      GANTRY_RF.select('bone'); GANTRY_RF.configure(20,120,'mCi');
      GANTRY_LIVE.setMatrix(128); GANTRY_LIVE.setZoom(1);
      GANTRY_LIVE.setEnergyCenter(140); GANTRY_LIVE.setWindowWidth(20); GANTRY_LIVE.setCollimator('LEHR');
      Object.assign(GANTRY.G,{arms:'down',rot:0,tableZ:176,tableH:85,detDist1:35,detDist2:35});
      GANTRY.render();
    }""")
    page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing', timeout=120000)
    page.wait_for_timeout(6500)
    assert not page.locator('#liveInfoD1').is_visible()
    assert not page.locator('#liveCameraSettings').is_visible()
    assert page.locator('#livePersistence').is_visible()
    assert page.locator('#liveBrightness').is_visible()
    page.evaluate('GANTRY_LIVE.setSignalPaused(true)')
    page.wait_for_timeout(150)
    unchanged = page.evaluate("""() => ({sample:GANTRY_LIVE.state.d1.eventSample,
      counts:GANTRY_LIVE.state.d1.windowCounts, pixels:document.getElementById('liveD1').toDataURL(),
      expected:GANTRY_LIVE.state.d1.expectedRate,settings:GANTRY_LIVE.settings})""")
    page.locator('#liveBrightness').fill('200')
    page.wait_for_timeout(150)
    assert page.locator('#liveBrightnessValue').inner_text() == '200 %'
    assert page.locator('#liveD1').evaluate('(el)=>getComputedStyle(el).filter') == 'brightness(2)'
    assert page.evaluate("""() => ({sample:GANTRY_LIVE.state.d1.eventSample,
      counts:GANTRY_LIVE.state.d1.windowCounts, pixels:document.getElementById('liveD1').toDataURL(),
      expected:GANTRY_LIVE.state.d1.expectedRate,settings:GANTRY_LIVE.settings})""") == unchanged
    assert page.evaluate("""() => {
      const meta=GANTRY_LIVE.state.d1;
      const expected=(meta.windowCounts/meta.windowSeconds).toLocaleString('es-CL',{maximumFractionDigits:2})+' cuentas/s';
      return document.getElementById('liveRateValueD1').textContent===expected;
    }""")
    page.locator('#liveInfoD1').locator('..').locator('summary').click()
    assert page.locator('#liveInfoD1').is_visible()
    page.wait_for_timeout(300)
    assert page.locator('#liveInfoD1').is_visible()
    page.locator('#liveInfoD1').locator('..').locator('summary').click()
    page.locator('#liveBrightness').fill('100')
    page.evaluate('GANTRY_LIVE.setSignalPaused(false)')
    page.wait_for_timeout(1500)
    initial = page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    # Click dispatch uses the real registered handler even if the older panel is hidden.
    page.evaluate("document.getElementById('liveMatrix256').click()")
    page.wait_for_selector('#liveRateD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_function("[...document.querySelectorAll('.live-count-comparison')].length===2 && [...document.querySelectorAll('.live-count-comparison')].every(n=>['noise','increase','decrease'].includes(n.dataset.kind))", timeout=30000)
    after_matrix = page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    assert abs(after_matrix / initial - 1) < .015, (initial, after_matrix)
    card = page.locator('#liveRateD1 .live-count-comparison')
    matrix = card.text_content()
    assert 'Promedio anterior:' in matrix and 'Promedio posterior:' in matrix, matrix
    assert card.evaluate('(el) => el.tagName === "DETAILS" && !el.open')
    assert 'Promedio anterior:' not in card.inner_text()
    compact = card.locator('summary').inner_text()
    if card.get_attribute('data-kind') == 'noise':
        assert compact == '≈', compact
    else:
        assert '%' in compact and compact[0] in ('⬆', '⇩'), compact
    card.locator('summary').click()
    assert card.evaluate('(el) => el.open')
    assert 'Promedio anterior:' in card.inner_text()
    assert not page.locator('#liveRateD2 .live-count-comparison').evaluate('(el) => el.open')
    assert page.locator('#liveInfoD1 .value-change-flash').count() == 0
    frozen = card.inner_text()
    page.wait_for_timeout(1500)
    assert card.inner_text() == frozen
    assert card.evaluate('(el) => el.open'), 'Live repaints must preserve expansion'
    card.locator('summary').click()
    page.wait_for_timeout(500)
    assert not card.evaluate('(el) => el.open')
    page.select_option('#liveWindowWidth', '10')
    page.wait_for_selector('#liveRateD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_selector('#liveRateD1 .live-count-comparison[data-kind="decrease"]', timeout=30000)
    energy = card.text_content()
    assert 'Descenso estadísticamente detectable' in energy
    assert not card.evaluate('(el) => el.open')
    assert card.inner_text().startswith('⇩ -') and '%' in card.inner_text()
    assert 'intervalos independientes' in page.locator('#liveRateD1 .live-count-comparison').get_attribute('title')
    result = page.evaluate("""() => {
      const card=document.querySelector('#liveRateD1 .live-count-comparison');
      const box=card.getBoundingClientRect(),parent=card.closest('.live-card').getBoundingClientRect();
      return {fits:box.left>=parent.left&&box.right<=parent.right&&box.bottom<=parent.bottom,
        sample:GANTRY_LIVE.state.d1.eventSample,card:card.textContent};
    }""")
    assert result['fits'], result
    screenshot = Path(__file__).resolve().parents[2] / 'gantry-count-significance.png'
    page.locator('#gantryLiveMonitors').screenshot(path=str(screenshot))
    # Different persistence changes displayed counts but must not multiply the rate.
    page.evaluate("""() => {const input=document.getElementById('livePersistence');
      input.value='3';input.dispatchEvent(new Event('input',{bubbles:true}));}""")
    page.wait_for_selector('#liveRateD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_function("document.querySelector('#liveRateD1 .live-count-comparison')?.dataset.kind!=='pending'", timeout=30000)
    persistence = card.text_content()
    assert 'cuentas/s' in persistence
    assert page.locator('#livePersistenceValue').inner_text() == '3 s'
    assert page.evaluate('GANTRY_LIVE.signal.duration') == 3
    # The same persistence control also applies to the dynamic renal live view.
    page.evaluate("GANTRY_RF.select('mag3');GANTRY_LIVE.setMatrix(128);Object.assign(GANTRY.G,{tableZ:140});GANTRY.render()")
    page.wait_for_function('GANTRY_MAG3.ready && GANTRY_LIVE.ready', timeout=120000)
    page.wait_for_timeout(200)
    assert page.locator('#liveRateValueD1').inner_text() == '0 cuentas/s'
    page.evaluate("async () => {GANTRY_RF.configure(5,0);await GANTRY_RF.inject();}")
    page.locator('#livePersistence').fill('1.5')
    page.wait_for_function('GANTRY_LIVE.state?.d2?.windowSeconds>=1.4', timeout=30000)
    assert page.evaluate('GANTRY_LIVE.state.d2.eventSample.counts') > 0
    assert page.evaluate('GANTRY_MAG3.state') is None
    page.locator('#livePersistence').fill('0.25')
    page.wait_for_function('GANTRY_LIVE.state?.d2?.windowSeconds<.4', timeout=5000)
    assert page.locator('#livePersistenceValue').inner_text() == '0,25 s'
    assert page.evaluate('GANTRY_LIVE.state.d2.expectedRate') > 0
    assert not errors, errors
    print(json.dumps({'matrix': matrix, 'energy': energy, 'persistence': persistence, 'layout': result}, ensure_ascii=True))
    print('Screenshot:', screenshot)
    browser.close()

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
    initial = page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    # Click dispatch uses the real registered handler even if the older panel is hidden.
    page.evaluate("document.getElementById('liveMatrix256').click()")
    page.wait_for_selector('#liveInfoD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_function("[...document.querySelectorAll('.live-count-comparison')].length===2 && [...document.querySelectorAll('.live-count-comparison')].every(n=>['noise','increase','decrease'].includes(n.dataset.kind))", timeout=30000)
    after_matrix = page.evaluate('GANTRY_LIVE.state.d1.expectedRate')
    assert abs(after_matrix / initial - 1) < .015, (initial, after_matrix)
    matrix = page.locator('#liveInfoD1 .live-count-comparison').inner_text()
    assert 'Promedio anterior:' in matrix and 'Promedio posterior:' in matrix, matrix
    assert page.locator('#liveInfoD1 .value-change-flash').count() == 0
    frozen = page.locator('#liveInfoD1 .live-count-comparison').inner_text()
    page.wait_for_timeout(1500)
    assert page.locator('#liveInfoD1 .live-count-comparison').inner_text() == frozen
    page.select_option('#liveWindowWidth', '10')
    page.wait_for_selector('#liveInfoD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_selector('#liveInfoD1 .live-count-comparison[data-kind="decrease"]', timeout=30000)
    energy = page.locator('#liveInfoD1 .live-count-comparison').inner_text()
    assert 'Descenso estadísticamente detectable' in energy
    assert 'intervalos independientes' in page.locator('#liveInfoD1 .live-count-comparison').get_attribute('title')
    result = page.evaluate("""() => {
      const card=document.querySelector('#liveInfoD1 .live-count-comparison');
      const box=card.getBoundingClientRect(),parent=card.parentElement.getBoundingClientRect();
      return {fits:box.left>=parent.left&&box.right<=parent.right&&box.bottom<=parent.bottom,
        sample:GANTRY_LIVE.state.d1.eventSample,card:card.textContent};
    }""")
    assert result['fits'], result
    screenshot = Path(__file__).resolve().parents[2] / 'gantry-count-significance.png'
    page.locator('#gantryLiveMonitors').screenshot(path=str(screenshot))
    # Different persistence changes displayed counts but must not multiply the rate.
    page.evaluate("""() => {const input=document.getElementById('bonePersistence');
      input.value='3';input.dispatchEvent(new Event('input',{bubbles:true}));}""")
    page.wait_for_selector('#liveInfoD1 .live-count-comparison[data-kind="pending"]')
    page.wait_for_function("document.querySelector('#liveInfoD1 .live-count-comparison')?.dataset.kind!=='pending'", timeout=30000)
    persistence = page.locator('#liveInfoD1 .live-count-comparison').inner_text()
    assert 'cuentas/s' in persistence
    assert not errors, errors
    print(json.dumps({'matrix': matrix, 'energy': energy, 'persistence': persistence, 'layout': result}, ensure_ascii=True))
    print('Screenshot:', screenshot)
    browser.close()

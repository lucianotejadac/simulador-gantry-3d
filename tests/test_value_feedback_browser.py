"""Check real live readouts show a prior average after a camera adjustment."""
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
      GANTRY_LIVE.setMatrix(256); GANTRY_LIVE.setZoom(1);
      GANTRY_LIVE.setEnergyCenter(140); GANTRY_LIVE.setWindowWidth(20); GANTRY_LIVE.setCollimator('LEHR');
      Object.assign(GANTRY.G,{arms:'down',rot:0,tableZ:176,tableH:85,detDist1:35,detDist2:35});
      GANTRY.render();
    }""")
    page.wait_for_function('GANTRY_BONE_ACQ.readyForProcessing', timeout=120000)
    page.wait_for_timeout(2500)
    page.evaluate("""() => {
      window.previousReadouts=[];
      window.previousReadoutTimer=setInterval(()=>{
        const text=document.getElementById('liveInfoD1').textContent;
        const match=text.match(/Total en ventana:\\s*([\\d.]+)/);
        if(match)previousReadouts.push(Number(match[1].replaceAll('.','')));
      },50);
    }""")
    page.wait_for_timeout(5500)
    page.evaluate('clearInterval(previousReadoutTimer)')
    page.select_option('#liveWindowWidth', '10')
    page.wait_for_selector('#liveInfoD1 .value-change-decrease[data-previous-label]', timeout=20000)
    result = page.evaluate("""() => {
      const node=document.querySelector('#liveInfoD1 .value-change-decrease');
      const caption=getComputedStyle(node,'::before');
      const panel=node.closest('.live-info'),rect=node.getBoundingClientRect(),bounds=panel.getBoundingClientRect();
      const width=parseFloat(caption.width),height=parseFloat(caption.height),gap=parseFloat(getComputedStyle(node).fontSize)*.85;
      const center=(rect.left+rect.right)/2;
      const left=node.classList.contains('value-change-label-left')?center-gap-width:center+gap;
      return {label:node.dataset.previousLabel,title:node.title,current:node.textContent,
        min:Math.min(...previousReadouts),max:Math.max(...previousReadouts),last:previousReadouts.at(-1),
        captionFits:left>=bounds.left-1&&left+width<=bounds.right+1,
        captionHeight:height,availableHeight:parseFloat(getComputedStyle(panel).lineHeight)-rect.height};
    }""")
    assert result['label'].startswith('promedio anterior: '), result
    average = float(result['label'].split(': ')[1].replace('.', '').replace(',', '.'))
    assert result['min'] <= average <= result['max'], result
    assert '5 s previos al cambio' in result['title'], result
    assert result['captionFits'], result
    screenshot = Path(__file__).resolve().parents[2] / 'gantry-previous-average.png'
    page.locator('#gantryLiveMonitors').screenshot(path=str(screenshot))
    assert result['captionHeight'] <= result['availableHeight'], result
    assert not errors, errors
    print(json.dumps(result, ensure_ascii=True))
    print('Screenshot:', screenshot)
    browser.close()

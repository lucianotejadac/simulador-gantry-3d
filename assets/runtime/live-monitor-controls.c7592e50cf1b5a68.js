/* Display-only controls; acquisitions keep their original pixel values. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),format=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
  function rate(meta,signal){
    if(!meta)return null;
    if(signal.mode==='live'&&Number.isFinite(meta.windowCounts)&&Number.isFinite(meta.windowSeconds))
      return meta.windowSeconds>0?meta.windowCounts/meta.windowSeconds:0;
    return Number.isFinite(meta.expectedRate)?meta.expectedRate:null;
  }
  function init(){
    const panel=el('gantryLiveMonitors');if(!panel||el('liveDisplayControls'))return;
    panel.classList.add('compact-live-monitors');
    const controls=document.createElement('div');controls.id='liveDisplayControls';
    controls.innerHTML='<label for="liveBrightness">Brillo <output id="liveBrightnessValue">100 %</output></label>'+
      '<input id="liveBrightness" type="range" min="25" max="400" step="5" value="100">'+
      '<label for="livePersistence">Persistencia <output id="livePersistenceValue">0,75 s</output></label>'+
      '<input id="livePersistence" type="range" min="0.25" max="5" step="0.25" value="0.75">';
    panel.querySelector('.live-monitor-title').after(controls);
    const settings=el('liveCameraSettings'),camera=document.createElement('details');
    camera.id='liveCameraDetails';camera.innerHTML='<summary>Parámetros de cámara</summary>';
    settings.before(camera);camera.append(settings);
    for(const n of [1,2]){
      const info=el('liveInfoD'+n),footer=document.createElement('div');footer.className='live-monitor-readout';
      footer.innerHTML='<div class="live-rate-row" id="liveRateD'+n+'"><output id="liveRateValueD'+n+'">— cuentas/s</output></div>'+
        '<details class="live-more"><summary>Más información</summary></details>';
      info.before(footer);footer.querySelector('.live-more').append(info);
    }
    el('liveBrightness').oninput=()=>{
      const value=Number(el('liveBrightness').value);
      panel.style.setProperty('--live-brightness',String(value/100));
      el('liveBrightnessValue').textContent=format(value)+' %';
    };
    el('livePersistence').oninput=()=>{
      // Dispatch the original control's event, including its feedback hooks.
      const source=el('bonePersistence');source.value=el('livePersistence').value;
      source.dispatchEvent(new Event('input',{bubbles:true}));refresh();
    };
    function refresh(){
      const live=window.GANTRY_LIVE;if(!live)return;
      el('livePersistence').value=String(live.signal.duration);
      el('livePersistenceValue').textContent=format(live.signal.duration)+' s';
      for(const n of [1,2]){
        const value=live.ready?rate(live.state?.['d'+n],live.signal):null;
        el('liveRateValueD'+n).textContent=(value===null?'—':format(value))+' cuentas/s';
      }
    }
    refresh();setInterval(refresh,100);
  }
  window.GANTRY_LIVE_MONITORS={rate};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

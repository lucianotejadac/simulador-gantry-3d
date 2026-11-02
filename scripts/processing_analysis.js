/* Analysis workspace for the selected acquisition, with bounded thumbnails and
   reversible processing keyed by SOP UID. Acquisition buffers stay immutable. */
(function(){
  'use strict';
  let polygon=[],editingThreshold=-1,thresholdImage='';
  let opened=false,timer=null,images=[],chosen=0,drag=null,identity='',galleryKey='',windowKey='';
  const roiColors=['#ff2020','#00cfff','#38e05b','#ffca28','#de65ff','#ff851b','#00d7ba','#ff77b7'];
  let tracingColor=null;
  const nextRoiColor=()=>tracingColor||roiColors[rois(source()).length%roiColors.length];
  const roiColor=(r,i)=>/^#[0-9a-f]{6}$/i.test(r.color||'')?r.color:roiColors[i%roiColors.length];
  const masks=new Map(),maskedDisplays=new Map(),panel=document.createElement('section');panel.id='analysisPanel';panel.hidden=true;
  panel.innerHTML=`<div class="mode-heading">Visualización / Análisis</div>
    <p id="analysisEmpty">Selecciona una adquisición terminada en la columna izquierda.</p>
    <div id="analysisContent" hidden>
      <div id="analysisDynamic"></div>
      <label id="analysisImageSelect">Imagen <select id="roiImage"></select></label>
      <div id="analysisStatic" hidden>
        <strong>ROI y mediciones</strong>
        <button id="roiAdd" aria-pressed="true">Agregar ROI</button><button id="roiMask" aria-pressed="false">Enmascarar</button><button id="roiBackground" aria-pressed="false">Fondo</button>
        <label>ROI <select id="roiShape"><option value="rectangle">Rectangular</option><option value="ellipse">Elíptica</option><option value="polygon">Punto por punto</option><option value="threshold">Punto por punto con umbral</option></select></label>
        <label id="roiThresholdLabel" hidden>Umbral mínimo (cuentas/píxel) <input id="roiThreshold" type="number" min="0" step="1" value="10"></label>
        <label id="roiThresholdTargetLabel" hidden>Editar ROI <select id="roiThresholdTarget"></select></label>
        <button id="roiFinish" hidden>Cerrar ROI</button><button id="roiCancel" hidden>Cancelar trazado</button>
        <label id="roiMaskMode" hidden>Enmascarar <select id="roiMode"><option value="background" hidden>Fondo</option><option value="measure" hidden selected>Medir (sin enmascarar)</option><option value="exclude">Ocultar interior</option><option value="keep">Conservar sólo interior</option></select></label>
        <label>Nombre de nueva ROI <input id="roiName" type="text" maxlength="80" placeholder="Ej.: Riñón derecho"></label>
        <button id="roiUndo">Deshacer última ROI</button><button id="roiReset">Quitar todas las ROI</button>
        <label><input type="checkbox" id="roiOriginal">Ver original</label>
        <p>Elige Agregar ROI para medir o Enmascarar para ocultar o conservar una región. Arrastra para una ROI rectangular o elíptica. Para punto por punto, haz clic en cada vértice y pulsa Cerrar ROI o haz doble clic en el punto final (mínimo 3 puntos); se une al primero con una línea recta. El contorno de una ROI con umbral sigue los píxeles seleccionados dentro del polígono original. El umbral de una ROI terminada se puede ajustar directamente; si hay varias, elige en Editar ROI. Con umbral, la ROI selecciona sólo los píxeles dentro del polígono con cuentas iguales o superiores al umbral. Cada imagen conserva sus propias máscaras. La ventana y el nivel se ajustan a la zona visible al cambiar la máscara; después puedes ajustarlos manualmente.</p></div>
      <div class="analysis-toolbar"><label>Ventana <input id="analysisWindow" type="number" min="1" step="any"></label>
        <label>Nivel <input id="analysisLevel" type="number" step="any"></label>
        <label><input id="analysisInvert" type="checkbox">Invertir</label>
        <button id="analysisExport">Exportar imagen procesada PNG</button></div>
      <div id="analysisGuides" class="analysis-toolbar"><label><input id="analysisLines" type="checkbox" checked>Líneas de referencia</label>
        <label>Vertical X <input id="analysisX" type="number" min="0" step="1" value="128"></label>
        <label>Horizontal Y <input id="analysisY" type="number" min="0" step="1" value="128"></label>
        <span>Coordenadas comunes a todos los frames (píxeles).</span></div>
      <div id="roiMeasurements" hidden></div>
      <div id="analysisPreviews">
        <figure id="analysisReferenceFigure"><figcaption id="analysisReferenceLabel">Referencia original</figcaption><div class="analysis-image"><canvas id="analysisReference"></canvas><i class="guide-x"></i><i class="guide-y"></i></div></figure>
        <figure><figcaption id="analysisSelectedLabel"></figcaption><div id="analysisDraw" class="analysis-image"><canvas id="analysisSelected"></canvas><i class="guide-x"></i><i class="guide-y"></i><svg id="roiSavedOutlines" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></svg><i id="roiOutline" hidden></i><svg id="roiPolygon" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" hidden></svg></div></figure>
      </div>
      <p id="analysisStatus" role="status"></p>
      <div id="analysisNudge" class="analysis-toolbar">Mover frame seleccionado:
        <button data-nudge="-1,0" aria-label="Mover frame a la izquierda">←</button><button data-nudge="1,0" aria-label="Mover frame a la derecha">→</button>
        <button data-nudge="0,-1" aria-label="Mover frame arriba">↑</button><button data-nudge="0,1" aria-label="Mover frame abajo">↓</button><span>1 píxel por pulsación</span></div>
      <div id="analysisFrames" aria-label="Todos los frames del detector"></div>
      <p>Procesamiento reversible, guardado en este navegador. El DICOM conserva la imagen original. Al agregarla a Página flexible se copia la versión enmascarada con su ventana y nivel.</p>
    </div>`;
  document.querySelector('.workspace').append(panel);
  $('analysisDynamic').append($('dynamicCorrection'));$('dynamicCorrection').open=true;
  const style=document.createElement('style');style.textContent=`
    #analysisPanel{min-width:0;min-height:0;overflow:auto;padding:6px;border:2px groove white;background:#c0c0c0;font:13px Arial}
    #analysisPanel [hidden],#analysisPanel[hidden]{display:none!important}
    #analysisPanel p{line-height:1.4;margin:8px 0}#analysisPanel label{display:inline-flex;align-items:center;gap:4px;margin:3px}
    #analysisPanel input[type=number]{width:75px;min-height:26px}#analysisPanel button,#analysisPanel select{min-height:28px;white-space:normal}
    .analysis-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:6px 0}
    #analysisPreviews{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}#analysisPreviews figure{margin:0;flex:1;min-width:150px;max-width:380px}
    #analysisPreviews figcaption{font-weight:bold;color:navy;padding:6px 0}
    .analysis-image{position:relative;background:#000;max-width:100%;width:100%;overflow:hidden;line-height:0;touch-action:none}
    .analysis-image canvas{display:block;width:100%;height:auto;image-rendering:pixelated}
    .guide-x,.guide-y{position:absolute;pointer-events:none;background:#00eaff;box-shadow:0 0 1px black}
    .guide-x{width:1px;top:0;bottom:0;left:var(--guide-x,50%)}.guide-y{height:1px;left:0;right:0;top:var(--guide-y,50%)}
    #analysisPanel.no-guides :is(.guide-x,.guide-y){display:none}
    #roiOutline{position:absolute;pointer-events:none;border:3px solid #ff2020;box-shadow:0 0 0 1px #fff,inset 0 0 0 1px #fff;box-sizing:border-box}
    #analysisFrames{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:6px;margin:8px 0}
    #analysisFrames button{padding:4px;min-width:0;text-align:left}#analysisFrames button[data-reference=true]{border:2px solid #008da8}#analysisFrames button[aria-pressed=true]{outline:3px solid #f09a19;outline-offset:-3px}
    #analysisFrames .analysis-image{max-width:160px;margin:auto}#analysisFrames small{display:block;font-size:11px;line-height:1.35;margin-top:4px}
    #analysisPanel :is(#roiAdd,#roiMask,#roiBackground)[aria-pressed=true]{border-style:inset;background:#d6def4;color:navy;font-weight:bold}#analysisDraw{cursor:crosshair}.analysis-tab{background:transparent;border:0;border-right:1px solid white;font-size:12px;padding:5px}
    .analysis-tab[aria-selected=true]{font-weight:bold;color:navy}
  `;document.head.append(style);
  const numericSliders=new Map(),imagePeaks=new WeakMap();
  for(const id of ['roiThreshold','analysisWindow','analysisLevel','analysisX','analysisY']){
    const input=$(id),box=document.createElement('span');box.className='analysis-number-slider';
    input.replaceWith(box);box.append(input);
    const slider=document.createElement('input');slider.type='range';slider.id=id+'Slider';slider.setAttribute('aria-label',({roiThreshold:'Umbral',analysisWindow:'Ventana',analysisLevel:'Nivel',analysisX:'Vertical X',analysisY:'Horizontal Y'})[id]);
    const limits=document.createElement('span');limits.className='analysis-slider-limits';const low=document.createElement('span'),high=document.createElement('span');limits.append(low,high);box.append(slider,limits);
    numericSliders.set(id,{input,slider,low,high});
    slider.oninput=()=>{input.value=id==='roiThreshold'?String(Math.round(Number(slider.value)**2/Number(slider.max))):slider.value;input.dispatchEvent(new Event('input',{bubbles:true}));};
    input.addEventListener('input',()=>syncSliders());
  }
  const sliderStyle=document.createElement('style');sliderStyle.textContent='#analysisPanel .analysis-number-slider{display:inline-flex;flex-direction:column;gap:2px;width:130px;vertical-align:top}#analysisPanel .analysis-number-slider input{width:100%;box-sizing:border-box;margin:0}#analysisPanel .analysis-number-slider input[type=range]{min-height:20px;padding:0}#analysisPanel .analysis-slider-limits{display:flex;justify-content:space-between;font-size:10px;line-height:1.2;color:#333}';document.head.append(sliderStyle);
  function syncSliders(){
    const s=source();if(!s)return;const [w,h]=dimensions(s);
    let peak=imagePeaks.get(s.pixels);if(peak===undefined){peak=0;for(const n of s.pixels)peak=Math.max(peak,n);imagePeaks.set(s.pixels,peak);}
    for(const [id,{input,slider,low,high}] of numericSliders){
      const coordinate=id==='analysisX'||id==='analysisY',min=id==='analysisWindow'?1:id==='analysisLevel'?-Math.max(1000,peak*4):0;
      const natural=coordinate?(id==='analysisX'?w:h)-1:Math.max(1000,Math.ceil((peak+1)*4));
      const max=coordinate?natural:Math.max(natural,Number(input.value)||0,slider.dataset.image===key(s)?Number(slider.max)||0:0);
      slider.dataset.image=key(s);
      slider.min=min;slider.max=max;slider.step=id==='analysisLevel'||id==='analysisWindow'?'0.5':'1';slider.value=id==='roiThreshold'?Math.sqrt(Math.max(0,Number(input.value)||0)*max):input.value||min;if(id==='roiThreshold'){slider.step='0.01';slider.setAttribute('aria-valuetext',input.value+' cuentas por pixel');}
      low.textContent=String(min);high.textContent=String(max);
    }
  }
  const bar=document.querySelector('.application-bar'),spans=[...bar.children].filter(e=>e.tagName==='SPAN'&&!e.classList.contains('mode'));
  const tabs=spans.slice(0,2).map((span,i)=>{const b=document.createElement('button');b.className='analysis-tab';b.type='button';b.textContent=span.textContent;b.setAttribute('aria-controls',i?'analysisPanel':'acquisition-panel');b.onclick=()=>show(!!i);span.replaceWith(b);return b;});
  function show(on){
    if(on)stopDynamic();
    if(document.body.classList.contains('flex-mode'))closeFlexible();
    opened=on;panel.hidden=!on;$('acquisition-panel').hidden=on;
    window.GANTRY_PROCESSING_EDITOR?.setPreviewVisible(!on);
    tabs.forEach((b,i)=>b.setAttribute('aria-selected',String(on===!!i)));
    if(on)refresh();
  }
  function schedule(){if(opened&&timer===null)timer=setTimeout(()=>{timer=null;refresh();},0);}
  function sourceImages(){
    if(!dataset||!pixels||window.GANTRY_PROCESSING_EDITOR?.currentId)return [];
    if(currentMode==='dynamic')return [{dataset,pixels,frameSize,frameCount}];
    const series=dataset.string('x0020000e'),all=Object.values(acquisitionInstances).flatMap(g=>Object.values(g)).filter(s=>s.pixels&&s.dataset.string('x0020000e')===series);
    all.push({dataset,pixels,frameSize,frameCount});
    return [...new Map(all.map(s=>[s.dataset.string('x00080018'),s])).values()].sort((a,b)=>Number(a.dataset.string('x00200013'))-Number(b.dataset.string('x00200013')));
  }
  function source(){return images[chosen]||images[0];}
  const canMask=()=>['static','whole'].includes(currentMode);
  function key(s){return s.dataset.string('x00080018');}
  function dimensions(s){return [num(s.dataset,'00280011'),num(s.dataset,'00280010')];}
  function rois(s){
    return savedMasks(key(s),...dimensions(s));
  }
  function savedMasks(id,w,h){
    if(!masks.has(id)){
      let saved=[];try{saved=JSON.parse(localStorage.getItem('gantry.roi.'+id)||'[]');}catch(_){}
      masks.set(id,Array.isArray(saved)?saved.filter(r=>window.GANTRY_ROI.valid(r,w,h)):[]);
    }return masks.get(id);
  }
  function persist(s){try{localStorage.setItem('gantry.roi.'+key(s),JSON.stringify(rois(s)));return true;}catch(_){return false;}}
  function offset(f){
    const o=window.GANTRY_DYNAMIC_CORRECTION.offset(f),[w,h]=dimensions(source());
    return $('corrView').value==='original'||!Number.isInteger(o.dx)||!Number.isInteger(o.dy)||Math.abs(o.dx)>=w||Math.abs(o.dy)>=h?{dx:0,dy:0}:o;
  }
  function raw(s,f=0){return s.pixels.subarray(f*s.frameSize,(f+1)*s.frameSize);}
  function paint(canvas,s,f=0,o={dx:0,dy:0},mask=[],thumbnail=false){
    const [w,h]=dimensions(s),size=thumbnail?Math.min(96,w):w,height=Math.round(size*h/w),ctx=canvas.getContext('2d');
    canvas.width=size;canvas.height=height;
    const image=ctx.createImageData(size,height),counts=raw(s,f),win=Math.max(1,Number($('analysisWindow').value)||1),level=Number($('analysisLevel').value)||0,
      invert=$('analysisInvert').checked!==(s.dataset.string('x00280004')==='MONOCHROME1');
    for(let y=0;y<height;y++)for(let x=0;x<size;x++){
      const px=Math.floor(x*w/size),py=Math.floor(y*h/height),sx=px-o.dx,sy=py-o.dy,
        p=sx>=0&&sx<w&&sy>=0&&sy<h?counts[sy*w+sx]:0,visible=window.GANTRY_ROI.visible(mask,px+.5,py+.5,p);
      let g=win<=1?(p>level-.5?255:0):Math.max(0,Math.min(255,((p-(level-.5))/(win-1)+.5)*255));if(!visible)g=0;if(invert)g=255-g;
      const i=(y*size+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=g;image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
  }
  function guides(){
    const s=source();if(!s)return;const [w,h]=dimensions(s);
    for(const [id,n] of [['analysisX',w],['analysisY',h]]){$(id).max=n-1;$(id).value=Math.min(n-1,Math.max(0,Number($(id).value)||0));}
    panel.style.setProperty('--guide-x',100*Number($('analysisX').value)/w+'%');panel.style.setProperty('--guide-y',100*Number($('analysisY').value)/h+'%');
    panel.classList.toggle('no-guides',currentMode!=='dynamic'||!$('analysisLines').checked);
  }
  function refresh(){
    if(!opened)return;
    panel.hidden=false;$('acquisition-panel').hidden=true;
    images=sourceImages();const empty=!images.length;$('analysisEmpty').hidden=!empty;$('analysisContent').hidden=empty;if(empty)return;
    const dynamic=currentMode==='dynamic',s0=images[0],id=s0.dataset.string('x0020000e')+':'+currentMode;
    if(identity!==id){cancelPolygon();identity=id;chosen=0;galleryKey='';drag=null;$('roiOutline').hidden=true;$('roiOriginal').checked=false;
      $('analysisWindow').value=$('window').value;$('analysisLevel').value=$('level').value;$('analysisInvert').checked=$('invert').checked;
      const [w,h]=dimensions(s0);$('analysisX').value=Math.floor(w/2);$('analysisY').value=Math.floor(h/2);
    }
    $('roiMeasurements').hidden=dynamic;$('roiSavedOutlines').style.display=dynamic?'none':'';
    $('analysisDynamic').hidden=!dynamic;$('analysisStatic').hidden=!canMask();
    $('analysisImageSelect').hidden=dynamic;
    for(const id of ['analysisGuides','analysisReferenceFigure','analysisNudge','analysisFrames'])$(id).hidden=!dynamic;
    if(dynamic){window.GANTRY_DYNAMIC_CORRECTION.sync();drawDynamic();}
    else{
      const selector=$('roiImage'),previous=chosen;selector.replaceChildren();images.forEach((s,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=value(s.dataset,'0008103e')||'Imagen '+(i+1);selector.append(opt);});chosen=Math.min(previous,images.length-1);selector.value=chosen;
      drawStatic();
    }
    guides();syncSliders();
  }
  function drawDynamic(){
    const s=source(),det=Number($('corrDetector').value)+1,stepIndex=Math.max(0,Number($('dyn-slider').value)),f=dynamicSteps[stepIndex]?.frames[det];
    const refIndex=Math.max(0,Math.min(dynamicSteps.length-1,Number($('corrReference').value)-1));$('corrReference').value=refIndex+1;
    const ref=dynamicSteps[refIndex]?.frames[det];
    if(f===undefined||ref===undefined)return;
    paint($('analysisReference'),s,ref);paint($('analysisSelected'),s,f,offset(f));
    $('analysisReferenceLabel').textContent='Referencia original · frame '+(refIndex+1)+' · D'+det;
    $('analysisSelectedLabel').textContent='Frame '+(stepIndex+1)+' · D'+det+' · '+($('corrView').value==='original'?'original':'corregido');
    const o=offset(f);$('analysisStatus').textContent=dynamicSteps.length+' frames · Detector '+det+' · seleccionado: X '+o.dx+', Y '+o.dy+' píxeles.';
    const newKey=identity+':'+key(s)+':'+det+':'+dynamicSteps.length;
    if(galleryKey!==newKey){
      galleryKey=newKey;const grid=$('analysisFrames');grid.replaceChildren();
      dynamicSteps.forEach((step,i)=>{
        if(step.frames[det]===undefined)return;
        const button=document.createElement('button');button.type='button';button.dataset.step=i;
        button.innerHTML='<div class="analysis-image"><canvas></canvas><i class="guide-x"></i><i class="guide-y"></i></div><small></small>';
        button.onclick=()=>{stopDynamic();setDynamicStep(i);refresh();};grid.append(button);
      });
    }
    for(const b of $('analysisFrames').children){const i=Number(b.dataset.step),step=dynamicSteps[i],f=step.frames[det],o=offset(f);
      paint(b.querySelector('canvas'),s,f,o,[],true);b.setAttribute('aria-pressed',String(i===stepIndex));b.dataset.reference=String(i===refIndex);
      b.querySelector('small').textContent='Frame '+(i+1)+' · fase '+step.phase+' · '+(frameDuration(f)/1000).toLocaleString('es-CL')+' s · X '+o.dx+' / Y '+o.dy;
    }
  }
  function thresholdTargets(){
    const s=source(),list=rois(s),select=$('roiThresholdTarget');
    if(thresholdImage!==key(s)){thresholdImage=key(s);editingThreshold=-1;}
    if(list[editingThreshold]?.shape!=='threshold')editingThreshold=list.findLastIndex(r=>r.shape==='threshold');
    select.replaceChildren();list.forEach((r,i)=>{if(r.shape!=='threshold')return;const o=document.createElement('option');o.value=i;o.textContent=r.name||'ROI '+(i+1);select.append(o);});
    select.value=editingThreshold;$('roiThresholdTargetLabel').hidden=editingThreshold<0;
    $('roiThresholdLabel').hidden=$('roiShape').value!=='threshold'&&editingThreshold<0;
    if(editingThreshold>=0&&!polygon.length)$('roiThreshold').value=list[editingThreshold].threshold;
  }
  $('roiThresholdTarget').onchange=()=>{editingThreshold=Number($('roiThresholdTarget').value);thresholdTargets();syncSliders();};
  $('roiThreshold').addEventListener('input',()=>{
    const s=source(),input=$('roiThreshold');if(!s||polygon.length||input.value===''||!input.checkValidity())return;
    const roi=rois(s)[editingThreshold];if(roi?.shape!=='threshold')return;
    roi.threshold=Number(input.value);const saved=persist(s);$('roiOriginal').checked=false;drawStatic();
    if(!saved)$('analysisStatus').textContent+=' No se pudo guardar en este navegador.';
  });
  function drawStatic(){
    thresholdTargets();
    const s=source(),[w,h]=dimensions(s),mask=canMask()&&!$('roiOriginal').checked?rois(s).filter(r=>!['measure','background'].includes(r.mode)):[];
    const result=window.GANTRY_ROI.apply(raw(s),w,h,mask);
    const nextWindowKey=JSON.stringify([key(s),mask.map(({name,color,...r})=>r),$('roiOriginal').checked]);
    if(nextWindowKey!==windowKey){
      windowKey=nextWindowKey;
      $('analysisWindow').value=Math.max(1,result.max-result.min+1);
      // All-zero or fully hidden images stay black, including threshold mode.
      $('analysisLevel').value=result.max===0?.5:(result.min+result.max)/2;
    }
    if(mask.length)maskedDisplays.set(key(s),{signature:JSON.stringify(mask),window:Number($('analysisWindow').value),level:Number($('analysisLevel').value),invert:$('analysisInvert').checked});
    paint($('analysisSelected'),s,0,{dx:0,dy:0},mask);
    $('analysisSelectedLabel').textContent=(value(s.dataset,'0008103e')||'Imagen')+(mask.length?' · enmascarada':' · original');
    $('analysisStatus').textContent=rois(s).length+' ROI · '+result.removed.toLocaleString('es-CL')+' cuentas ocultas en esta vista. Original conservado.';
    $('roiUndo').disabled=$('roiReset').disabled=!rois(s).length;syncSliders();renderMeasurements();
  }
  function renderMeasurements(){
    const s=source(),[w,h]=dimensions(s),list=rois(s),host=$('roiMeasurements'),svg=$('roiSavedOutlines');
    let assigned=false;for(const r of list)if(!r.id){r.id=crypto.randomUUID();assigned=true;}if(assigned)persist(s);
    host.replaceChildren();host.hidden=!list.length;svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    if(!list.length)return;
    const description=document.createElement('p');description.textContent='Mediciones sobre las cuentas originales, independientes de ventana, nivel y otras máscaras. En ROI con umbral se cuentan solo los píxeles que lo cumplen.';host.append(description);const note=document.createElement('p');note.textContent='Fondo: dibuja una región cercana sin captación del órgano y selecciona su ROI de referencia. Se excluye el solapamiento con esa ROI. Fondo estimado = media del fondo × píxeles de la ROI; netas = cuentas ROI - fondo estimado. No se modifica la imagen. Si no hay píxeles válidos, no se calcula la corrección.';host.append(note);
    const table=document.createElement('table');table.style.cssText='border-collapse:collapse;width:100%;font-size:12px;margin:8px 0';
    const header=document.createElement('tr');for(const text of ['Nombre','Uso','Cuentas totales','Media / píxel','Máximo / píxel','Área (píxeles)','Área (mm²)','ROI de referencia','Fondo estimado','Cuentas netas']){const th=document.createElement('th');th.textContent=text;header.append(th);}table.append(header);
    const spacing=(s.dataset.string('x00280030')||'').split('\\').map(Number),format=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
    list.forEach((roi,i)=>{
      const row=document.createElement('tr'),name=document.createElement('input');name.type='text';name.maxLength=80;name.value=roi.name||'ROI '+(i+1);name.setAttribute('aria-label','Nombre ROI '+(i+1));
      name.onchange=()=>{roi.name=name.value.trim()||'ROI '+(i+1);persist(s);drawStatic();};
      const nameAndColor=document.createElement('span');nameAndColor.style.cssText='display:flex;align-items:center;gap:6px';const color=document.createElement('input');color.type='color';color.value=roiColor(roi,i);color.setAttribute('aria-label','Color ROI '+(i+1));color.style.cssText='width:38px;min-width:38px;height:28px;padding:1px';nameAndColor.append(name,color);
      color.oninput=()=>{roi.color=color.value;persist(s);outline.setAttribute('stroke',roi.color);label.setAttribute('fill',roi.color);};
      const use=document.createElement('select');use.setAttribute('aria-label','Uso ROI '+(i+1));
      for(const [v,t] of [['measure','Medir'],['background','Fondo'],['exclude','Ocultar interior'],['keep','Conservar interior']]){const o=document.createElement('option');o.value=v;o.textContent=t;use.append(o);}use.value=roi.mode;
      use.onchange=()=>{roi.mode=use.value;if(roi.mode==='background'&&roi.shape==='threshold')roi.shape='polygon';persist(s);drawStatic();};
      const reference=document.createElement('select');reference.setAttribute('aria-label','ROI de referencia del fondo '+(i+1));
      const empty=document.createElement('option');empty.value='';empty.textContent='Seleccionar ROI';reference.append(empty);
      for(const target of list)if(target!==roi&&target.mode!=='background'){const o=document.createElement('option');o.value=target.id;o.textContent=target.name||'ROI';reference.append(o);}reference.value=roi.targetId||'';
      reference.onchange=()=>{roi.targetId=reference.value||null;persist(s);drawStatic();};
      const target=roi.mode==='background'?list.find(r=>r.id===roi.targetId&&r!==roi&&r.mode!=='background'):null;
      const correction=target?window.GANTRY_ROI.background(raw(s),w,h,target,roi,spacing):null;
      const result=correction?.background||window.GANTRY_ROI.measure(raw(s),w,h,roi,spacing);
      for(const value of [nameAndColor,use,format(result.total),format(result.mean),format(result.max),format(result.pixels),result.areaMm2===null?'No disponible':format(result.areaMm2),roi.mode==='background'?reference:'—',correction?.estimated==null?'—':format(correction.estimated),correction?.net==null?'—':format(correction.net)]){const td=document.createElement('td');td.style.cssText='padding:4px;border:1px solid #888';if(typeof value==='string')td.textContent=value;else td.append(value);row.append(td);}table.append(row);
      const ns='http://www.w3.org/2000/svg',outline=document.createElementNS(ns,roi.shape==='threshold'?'path':roi.points?'polygon':roi.shape==='ellipse'?'ellipse':'rect');
      let x,y;
      if(roi.points){if(roi.shape==='threshold')outline.setAttribute('d',window.GANTRY_ROI.contour(raw(s),w,h,roi));else outline.setAttribute('points',roi.points.map(p=>p.x+','+p.y).join(' '));x=Math.min(...roi.points.map(p=>p.x));y=Math.min(...roi.points.map(p=>p.y));}
      else{x=Math.min(roi.x0,roi.x1);y=Math.min(roi.y0,roi.y1);const width=Math.abs(roi.x1-roi.x0),height=Math.abs(roi.y1-roi.y0);const attrs=roi.shape==='ellipse'?{cx:x+width/2,cy:y+height/2,rx:width/2,ry:height/2}:{x,y,width,height};for(const [k,v] of Object.entries(attrs))outline.setAttribute(k,v);}
      for(const [k,v] of Object.entries({fill:'none',stroke:roiColor(roi,i),'stroke-width':2,'vector-effect':'non-scaling-stroke'}))outline.setAttribute(k,v);svg.append(outline);
      const label=document.createElementNS(ns,'text');label.textContent=roi.name||'ROI '+(i+1);label.setAttribute('x',x);label.setAttribute('y',Math.max(w/28,y-2));label.setAttribute('font-size',w/32);label.setAttribute('fill',roiColor(roi,i));label.setAttribute('stroke','white');label.setAttribute('stroke-width',w/500);label.setAttribute('paint-order','stroke');svg.append(label);
    });host.append(table);
  }
  function point(e){const c=$('analysisSelected'),r=c.getBoundingClientRect(),[w,h]=dimensions(source());
    if(!r.width||!r.height)return null;return {x:Math.max(0,Math.min(w,(e.clientX-r.left)*w/r.width)),y:Math.max(0,Math.min(h,(e.clientY-r.top)*h/r.height))};}
  function outline(p){const [w,h]=dimensions(source()),node=$('roiOutline');node.hidden=false;node.style.borderColor=nextRoiColor();
    Object.assign(node.style,{left:100*Math.min(drag.x,p.x)/w+'%',top:100*Math.min(drag.y,p.y)/h+'%',width:100*Math.abs(p.x-drag.x)/w+'%',height:100*Math.abs(p.y-drag.y)/h+'%',borderRadius:$('roiShape').value==='ellipse'?'50%':'0'});}
  function cancelPolygon(){polygon=[];tracingColor=null;$('roiPolygon').setAttribute('hidden','');$('roiFinish').disabled=true;}
  function polygonOutline(cursor){const [w,h]=dimensions(source()),svg=$('roiPolygon');svg.removeAttribute('hidden');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML='<polyline fill="none" stroke="'+nextRoiColor()+'" stroke-width="3" vector-effect="non-scaling-stroke" points="'+(cursor?[...polygon,cursor]:polygon).map(p=>p.x+','+p.y).join(' ')+'"/>'+polygon.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="1.5" fill="'+nextRoiColor()+'" stroke="white" stroke-width="1" vector-effect="non-scaling-stroke"/>').join('');$('roiFinish').disabled=polygon.length<3;}
  $('roiShape').onchange=()=>{cancelPolygon();drag=null;$('roiOutline').hidden=true;const poly=['polygon','threshold'].includes($('roiShape').value);$('roiFinish').hidden=$('roiCancel').hidden=!poly;thresholdTargets();syncSliders();};
  $('roiCancel').onclick=cancelPolygon;
  function chooseRoiTool(mask){
    cancelPolygon();drag=null;$('roiOutline').hidden=true;
    $('roiMode').value=mask?'exclude':'measure';$('roiMaskMode').hidden=!mask;
    $('roiAdd').setAttribute('aria-pressed',String(!mask));$('roiMask').setAttribute('aria-pressed',String(mask));$('roiBackground').setAttribute('aria-pressed','false');
    $('analysisStatus').textContent=mask?'Dibuja una ROI para enmascarar.':'Dibuja una ROI para medir sin ocultar la imagen.';
  }
  $('roiAdd').onclick=()=>chooseRoiTool(false);$('roiMask').onclick=()=>chooseRoiTool(true);
  $('roiBackground').onclick=()=>{chooseRoiTool(false);$('roiMode').value='background';$('roiAdd').setAttribute('aria-pressed','false');$('roiBackground').setAttribute('aria-pressed','true');if($('roiShape').value==='threshold'){$('roiShape').value='polygon';$('roiShape').onchange();}$('analysisStatus').textContent='Dibuja el fondo junto a la ROI del órgano; después puedes elegir su ROI de referencia.';};

  $('roiFinish').onclick=()=>{const s=source();if(!s)return;const roi={shape:$('roiShape').value,mode:$('roiMode').value,points:polygon.map(p=>({...p})),threshold:Number($('roiThreshold').value)};if(!window.GANTRY_ROI.valid(roi,...dimensions(s))){$('analysisStatus').textContent='Revisa el polígono y el umbral (cero o superior).';return;}roi.name=$('roiName').value.trim()||'ROI '+(rois(s).length+1);roi.color=nextRoiColor();roi.id=crypto.randomUUID();if(roi.mode==='background'){if(roi.shape==='threshold')roi.shape='polygon';roi.targetId=rois(s).findLast(r=>r.mode!=='background')?.id||null;}rois(s).push(roi);$('roiName').value='';editingThreshold=roi.shape==='threshold'?rois(s).length-1:editingThreshold;const saved=persist(s);cancelPolygon();$('roiOriginal').checked=false;drawStatic();if(!saved)$('analysisStatus').textContent+=' No se pudo guardar en este navegador.';};
  const draw=$('analysisDraw');
  draw.onpointerdown=e=>{if(!canMask()||!source())return;e.preventDefault();if(!tracingColor)tracingColor=roiColors[rois(source()).length%roiColors.length];if(['polygon','threshold'].includes($('roiShape').value)){if(e.detail>1)return;const p=point(e);if(p){polygon.push(p);polygonOutline();}return;}drag=point(e);if(drag){draw.setPointerCapture?.(e.pointerId);outline(drag);}};
  draw.onpointermove=e=>{if(drag){const p=point(e);if(p)outline(p);}else if(polygon.length){const p=point(e);if(p)polygonOutline(p);}};
  draw.onpointerleave=()=>{if(polygon.length)polygonOutline();};
  draw.ondblclick=e=>{
    if(!canMask()||!source()||!['polygon','threshold'].includes($('roiShape').value)||!polygon.length)return;
    e.preventDefault();const p=point(e);if(!p)return;
    // The first click already appended the endpoint; the second must not duplicate it.
    polygon[polygon.length-1]=p;polygonOutline();
    if(polygon.length>=3)$('roiFinish').click();
  };

  draw.onpointerup=e=>{if(!drag)return;const p=point(e),start=drag;drag=null;$('roiOutline').hidden=true;
    if(!p)return;const s=source(),[w,h]=dimensions(s),roi={shape:$('roiShape').value,mode:$('roiMode').value,x0:start.x,y0:start.y,x1:p.x,y1:p.y};
    if(!window.GANTRY_ROI.valid(roi,w,h))return;roi.name=$('roiName').value.trim()||'ROI '+(rois(s).length+1);roi.color=nextRoiColor();roi.id=crypto.randomUUID();if(roi.mode==='background'){if(roi.shape==='threshold')roi.shape='polygon';roi.targetId=rois(s).findLast(r=>r.mode!=='background')?.id||null;}rois(s).push(roi);tracingColor=null;$('roiName').value='';const saved=persist(s);$('roiOriginal').checked=false;drawStatic();if(!saved)$('analysisStatus').textContent+=' No se pudo guardar; conserva esta pestaña.';
  };
  draw.onpointercancel=()=>{tracingColor=null;drag=null;$('roiOutline').hidden=true;};
  $('roiImage').onchange=()=>{cancelPolygon();drag=null;$('roiOutline').hidden=true;chosen=Number($('roiImage').value);$('roiOriginal').checked=false;drawStatic();};
  $('roiOriginal').onchange=drawStatic;
  $('roiUndo').onclick=()=>{rois(source()).pop();persist(source());drawStatic();};
  $('roiReset').onclick=()=>{masks.set(key(source()),[]);persist(source());drawStatic();};
  for(const id of ['analysisX','analysisY','analysisLines'])$(id).oninput=guides;
  for(const id of ['analysisWindow','analysisLevel','analysisInvert'])$(id).oninput=schedule;
  for(const id of ['corrReference','corrDetector','corrView'])$(id).addEventListener('change',schedule);
  for(const id of ['corrApply','corrReset','corrResetAll'])$(id).addEventListener('click',schedule);
  panel.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{const [dx,dy]=b.dataset.nudge.split(',').map(Number);$('corrX').value=Number($('corrX').value)+dx;$('corrY').value=Number($('corrY').value)+dy;$('corrApply').click();});
  $('analysisExport').onclick=()=>{const a=document.createElement('a');a.download='simulacion-'+currentMode+'-procesada.png';a.href=$('analysisSelected').toDataURL('image/png');a.click();};
  const modeUpdate=updateModeUI;updateModeUI=function(...args){const r=modeUpdate(...args);if(opened&&window.GANTRY_PROCESSING_EDITOR?.currentId)show(false);else schedule();return r;};
  const renderPrevious=renderAll;renderAll=function(...args){const r=renderPrevious(...args);schedule();return r;};
  const stepPrevious=setDynamicStep;setDynamicStep=function(...args){const r=stepPrevious(...args);schedule();return r;};
  const flexiblePrevious=openFlexible;openFlexible=function(...args){show(false);return flexiblePrevious(...args);};
  function prepareFlexible(item,asset){
    if(!['static','whole'].includes(asset.kind)||asset.dynamicFrames)return;
    const mask=savedMasks(asset.uid,asset.cols,asset.rows).filter(r=>!['measure','background'].includes(r.mode));if(!mask.length)return;
    // Copy the processing into this page item; keep its acquired pixels untouched.
    item.roiMasks=JSON.parse(JSON.stringify(mask));
    const result=window.GANTRY_ROI.apply(asset.data,asset.cols,asset.rows,mask);
    const saved=maskedDisplays.get(asset.uid),current=source();
    const display=current&&key(current)===asset.uid&&!$('roiOriginal').checked?
      {window:Number($('analysisWindow').value),level:Number($('analysisLevel').value),invert:$('analysisInvert').checked}:
      saved?.signature===JSON.stringify(mask)?saved:null;
    item.window=display&&Number.isFinite(display.window)&&display.window>=1?display.window:Math.max(1,result.max-result.min+1);
    item.level=display&&Number.isFinite(display.level)?display.level:result.max===0?.5:(result.min+result.max)/2;
    if(display)item.invert=display.invert;
  }
  window.GANTRY_PROCESSING_ANALYSIS={show,refresh,prepareFlexible,get opened(){return opened;}};
  show(false);
})();

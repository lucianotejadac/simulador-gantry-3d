/* Analysis workspace for the selected acquisition, with bounded thumbnails and
   reversible processing keyed by SOP UID. Acquisition buffers stay immutable. */
(function(){
  'use strict';
  let opened=false,timer=null,images=[],chosen=0,drag=null,identity='',galleryKey='',windowKey='';
  const masks=new Map(),maskedDisplays=new Map(),panel=document.createElement('section');panel.id='analysisPanel';panel.hidden=true;
  panel.innerHTML=`<div class="mode-heading">Visualización / Análisis</div>
    <p id="analysisEmpty">Selecciona una adquisición terminada en la columna izquierda.</p>
    <div id="analysisContent" hidden>
      <div id="analysisDynamic"></div>
      <label id="analysisImageSelect">Imagen <select id="roiImage"></select></label>
      <div id="analysisStatic" hidden>
        <strong>Enmascarar imagen</strong>
        <label>ROI <select id="roiShape"><option value="rectangle">Rectangular</option><option value="ellipse">Elíptica</option></select></label>
        <label>Máscara <select id="roiMode"><option value="exclude">Ocultar interior</option><option value="keep">Conservar sólo interior</option></select></label>
        <button id="roiUndo">Deshacer última ROI</button><button id="roiReset">Quitar máscaras</button>
        <label><input type="checkbox" id="roiOriginal">Ver original</label>
        <p>Arrastra sobre la imagen para dibujar una ROI. Cada imagen conserva sus propias máscaras. La ventana y el nivel se ajustan a la zona visible al cambiar la máscara; después puedes ajustarlos manualmente.</p></div>
      <div class="analysis-toolbar"><label>Ventana <input id="analysisWindow" type="number" min="1" step="any"></label>
        <label>Nivel <input id="analysisLevel" type="number" step="any"></label>
        <label><input id="analysisInvert" type="checkbox">Invertir</label>
        <button id="analysisExport">Exportar imagen procesada PNG</button></div>
      <div id="analysisGuides" class="analysis-toolbar"><label><input id="analysisLines" type="checkbox" checked>Líneas de referencia</label>
        <label>Vertical X <input id="analysisX" type="number" min="0" step="1" value="128"></label>
        <label>Horizontal Y <input id="analysisY" type="number" min="0" step="1" value="128"></label>
        <span>Coordenadas comunes a todos los frames (píxeles).</span></div>
      <div id="analysisPreviews">
        <figure id="analysisReferenceFigure"><figcaption id="analysisReferenceLabel">Referencia original</figcaption><div class="analysis-image"><canvas id="analysisReference"></canvas><i class="guide-x"></i><i class="guide-y"></i></div></figure>
        <figure><figcaption id="analysisSelectedLabel"></figcaption><div id="analysisDraw" class="analysis-image"><canvas id="analysisSelected"></canvas><i class="guide-x"></i><i class="guide-y"></i><i id="roiOutline" hidden></i></div></figure>
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
    #roiOutline{position:absolute;pointer-events:none;border:2px dashed #ffda35;box-sizing:border-box}
    #analysisFrames{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:6px;margin:8px 0}
    #analysisFrames button{padding:4px;min-width:0;text-align:left}#analysisFrames button[data-reference=true]{border:2px solid #008da8}#analysisFrames button[aria-pressed=true]{outline:3px solid #f09a19;outline-offset:-3px}
    #analysisFrames .analysis-image{max-width:160px;margin:auto}#analysisFrames small{display:block;font-size:11px;line-height:1.35;margin-top:4px}
    #analysisDraw{cursor:crosshair}.analysis-tab{background:transparent;border:0;border-right:1px solid white;font-size:12px;padding:5px}
    .analysis-tab[aria-selected=true]{font-weight:bold;color:navy}
  `;document.head.append(style);
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
        visible=window.GANTRY_ROI.visible(mask,px+.5,py+.5),p=sx>=0&&sx<w&&sy>=0&&sy<h?counts[sy*w+sx]:0;
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
    if(identity!==id){identity=id;chosen=0;galleryKey='';drag=null;$('roiOutline').hidden=true;$('roiOriginal').checked=false;
      $('analysisWindow').value=$('window').value;$('analysisLevel').value=$('level').value;$('analysisInvert').checked=$('invert').checked;
      const [w,h]=dimensions(s0);$('analysisX').value=Math.floor(w/2);$('analysisY').value=Math.floor(h/2);
    }
    $('analysisDynamic').hidden=!dynamic;$('analysisStatic').hidden=!canMask();
    $('analysisImageSelect').hidden=dynamic;
    for(const id of ['analysisGuides','analysisReferenceFigure','analysisNudge','analysisFrames'])$(id).hidden=!dynamic;
    if(dynamic){window.GANTRY_DYNAMIC_CORRECTION.sync();drawDynamic();}
    else{
      const selector=$('roiImage'),previous=chosen;selector.replaceChildren();images.forEach((s,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=value(s.dataset,'0008103e')||'Imagen '+(i+1);selector.append(opt);});chosen=Math.min(previous,images.length-1);selector.value=chosen;
      drawStatic();
    }
    guides();
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
  function drawStatic(){
    const s=source(),[w,h]=dimensions(s),mask=canMask()&&!$('roiOriginal').checked?rois(s):[];
    const result=window.GANTRY_ROI.apply(raw(s),w,h,mask);
    const nextWindowKey=JSON.stringify([key(s),mask,$('roiOriginal').checked]);
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
    $('roiUndo').disabled=$('roiReset').disabled=!rois(s).length;
  }
  function point(e){const c=$('analysisSelected'),r=c.getBoundingClientRect(),[w,h]=dimensions(source());
    if(!r.width||!r.height)return null;return {x:Math.max(0,Math.min(w,(e.clientX-r.left)*w/r.width)),y:Math.max(0,Math.min(h,(e.clientY-r.top)*h/r.height))};}
  function outline(p){const [w,h]=dimensions(source()),node=$('roiOutline');node.hidden=false;
    Object.assign(node.style,{left:100*Math.min(drag.x,p.x)/w+'%',top:100*Math.min(drag.y,p.y)/h+'%',width:100*Math.abs(p.x-drag.x)/w+'%',height:100*Math.abs(p.y-drag.y)/h+'%',borderRadius:$('roiShape').value==='ellipse'?'50%':'0'});}
  const draw=$('analysisDraw');
  draw.onpointerdown=e=>{if(!canMask()||!source())return;e.preventDefault();drag=point(e);if(drag){draw.setPointerCapture?.(e.pointerId);outline(drag);}};
  draw.onpointermove=e=>{if(drag){const p=point(e);if(p)outline(p);}};
  draw.onpointerup=e=>{if(!drag)return;const p=point(e),start=drag;drag=null;$('roiOutline').hidden=true;
    if(!p)return;const s=source(),[w,h]=dimensions(s),roi={shape:$('roiShape').value,mode:$('roiMode').value,x0:start.x,y0:start.y,x1:p.x,y1:p.y};
    if(!window.GANTRY_ROI.valid(roi,w,h))return;rois(s).push(roi);const saved=persist(s);$('roiOriginal').checked=false;drawStatic();if(!saved)$('analysisStatus').textContent+=' No se pudo guardar; conserva esta pestaña.';
  };
  draw.onpointercancel=()=>{drag=null;$('roiOutline').hidden=true;};
  $('roiImage').onchange=()=>{drag=null;$('roiOutline').hidden=true;chosen=Number($('roiImage').value);$('roiOriginal').checked=false;drawStatic();};
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
    const mask=savedMasks(asset.uid,asset.cols,asset.rows);if(!mask.length)return;
    // Copy the processing into this page item; keep its acquired pixels untouched.
    item.roiMasks=mask.map(r=>({...r}));
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

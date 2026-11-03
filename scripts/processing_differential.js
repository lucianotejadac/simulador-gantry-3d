/* Relative renal uptake from explicitly assigned, background-corrected ROI. */
(function(){
  'use strict';
  function calculate(views){
    if(!Array.isArray(views)||![1,2].includes(views.length))throw Error('Selecciona una o dos proyecciones.');
    const corrected=views.map(view=>{
      if(!view.right||!view.left||view.right.id===view.left.id)throw Error('Selecciona ROI diferentes para el riñón derecho y el izquierdo.');
      return ['right','left'].map(side=>{
        const roi=view[side],bg=view[side+'Background'];
        if(!(roi.pixels>0)||!Number.isFinite(roi.total)||roi.total<0)throw Error('La ROI renal no tiene píxeles válidos.');
        if(bg&&(!(bg.pixels>0)||!Number.isFinite(bg.mean)||bg.mean<0||bg.targetId!==roi.id))throw Error('Selecciona un fondo válido asociado a la ROI renal.');
        const background=bg?bg.mean*roi.pixels:0,net=roi.total-background;
        if(net<0)throw Error('Las cuentas netas son negativas. Revisa la ROI renal y su fondo.');
        if(views.length===2&&!(Number.isFinite(view.seconds)&&view.seconds>0))throw Error('Falta una duración válida para la media geométrica.');
        return {name:roi.name,total:roi.total,background,net,corrected:!!bg,rate:views.length===2?net/view.seconds:net};
      });
    });
    const weights=[0,1].map(i=>views.length===2?Math.sqrt(corrected[0][i].rate)*Math.sqrt(corrected[1][i].rate):corrected[0][i].net);
    const sum=weights[0]+weights[1];if(!(sum>0)||!Number.isFinite(sum))throw Error('No hay cuentas netas suficientes para calcular la función diferencial.');
    return {right:100*weights[0]/sum,left:100*weights[1]/sum,weights,corrected,method:views.length===2?'geometric':'single'};
  }
  const api={calculate};window.GANTRY_DIFFERENTIAL=api;
  if(typeof document==='undefined'||!document.querySelector('.application-bar'))return;
  const dialog=document.createElement('section');dialog.id='differential-dialog';dialog.hidden=true;dialog.setAttribute('aria-label','Función diferencial renal');
  dialog.style.cssText='margin:14px 0;padding:12px;border:2px groove white;background:#c0c0c0;min-width:0';
  dialog.innerHTML='<h2>Calcular función diferencial renal</h2><p id="differential-acquisition"></p><label>Método <select id="differential-method"><option value="single">Una proyección (habitualmente posterior)</option><option value="geometric">Media geométrica anterior / posterior</option></select></label><p>Selecciona ROI que incluyan cada riñón completo. Asigna derecha e izquierda según el paciente, no según el lado de la pantalla. Los fondos deben estar vinculados a sus ROI renales.</p><div id="differential-views"></div><p id="differential-error" role="alert" style="color:#900"></p><div id="differential-result" aria-live="polite"></div><p style="font-size:11px">Porcentaje = cuentas netas del riñón / suma de ambos × 100. Fondo = media del fondo × área de la ROI renal. La media geométrica usa √(tasa anterior × tasa posterior) por riñón. Las cuentas proceden de las imágenes originales, independientemente de las máscaras y del contraste. Es captación relativa, no filtrado glomerular absoluto.</p><p style="font-size:11px"><a href="https://snmmi.org/common/Uploaded%20files/Web/Clinical%20Practice/Procedure%20Standards/2021/SNMMI%20EANM%20DMSA%20guideline_final.pdf" target="_blank" rel="noopener">Método: guía SNMMI/EANM de DMSA</a></p><div class="layout-dialog-actions"><button id="differential-close">Cerrar</button><button id="differential-calculate">Calcular</button></div>';
  document.getElementById('analysisPreviews').after(dialog);
  let assets=[],panels=[],selectedAcquisition=null;
  const el=id=>document.getElementById(id),format=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
  function clear(){api.lastResult=null;el('differential-error').textContent='';el('differential-result').replaceChildren();}
  function select(label,host){const row=document.createElement('label');row.style.cssText='display:block;margin:8px 0';row.append(document.createTextNode(label+' '));const node=document.createElement('select');node.style.maxWidth='100%';node.setAttribute('aria-label',label);row.append(node);host.append(row);return node;}
  function options(node,entries){node.replaceChildren();for(const [id,label]of entries){const option=document.createElement('option');option.value=id;option.textContent=label;node.append(option);}}
  function populate(panel,preserve=false){
    panel.asset=assets[Number(panel.image.value)];panel.rows=panel.asset?window.GANTRY_PROCESSING_ANALYSIS.measurementRows(panel.asset):[];
    for(const side of ['right','left']){
      const previous=panel[side].value,previousBackground=panel[side+'Background'].value;
      options(panel[side],[['','Seleccionar ROI'],...panel.rows.filter(r=>r.use!=='background').map(r=>[r.id,r.name])]);
      if(preserve&&[...panel[side].options].some(o=>o.value===previous))panel[side].value=previous;
      backgrounds(panel,side);
      if(preserve&&[...panel[side+'Background'].options].some(o=>o.value===previousBackground))panel[side+'Background'].value=previousBackground;
    }clear();
  }
  function backgrounds(panel,side){
    const linked=panel.rows.filter(r=>r.use==='background'&&r.targetId===panel[side].value);
    options(panel[side+'Background'],[['','Sin corrección de fondo'],...linked.map(r=>[r.id,r.name])]);
    if(linked.length===1)panel[side+'Background'].value=linked[0].id;
    clear();
  }
  function render(){
    clear();panels=[];el('differential-views').replaceChildren();
    const count=el('differential-method').value==='geometric'?2:1;
    for(let i=0;i<count;i++){
      const box=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=count===1?'Proyección seleccionada':i===0?'Proyección anterior':'Proyección posterior';box.append(legend);el('differential-views').append(box);
      const panel={image:select('Imagen '+(i+1),box)};options(panel.image,assets.map((a,j)=>[j,a.seriesName+' · '+a.projection]));
      const posterior=assets.findIndex(a=>/\b(PA|posterior)\b/i.test(a.projection));
      panel.image.value=count===1&&posterior>=0?posterior:Math.min(i,assets.length-1);
      for(const [side,label]of [['right','Riñón derecho'],['left','Riñón izquierdo']]){
        panel[side]=select(label+' · ROI '+(i+1),box);panel[side+'Background']=select(label+' · fondo '+(i+1),box);
        panel[side].onchange=()=>backgrounds(panel,side);panel[side+'Background'].onchange=clear;
      }
      panel.image.onchange=()=>populate(panel);panels.push(panel);populate(panel);
    }
  }
  api.refreshRois=uid=>{
    if(dialog.hidden)return;
    for(const panel of panels)if(panel.asset?.uid===uid)populate(panel,true);
  };
  const resultKey=id=>'gantry.differential.'+id;
  const signature=items=>JSON.stringify(items.map(a=>window.GANTRY_PROCESSING_ANALYSIS.measurementRows(a)));
  api.savedResult=id=>{
    try{
      const saved=JSON.parse(localStorage.getItem(resultKey(id))||'null');if(!saved)return null;
      const images=saved.assetIds.map(assetId=>flex.assets.find(a=>a.id===assetId));
      return images.every(Boolean)&&signature(images)===saved.signature?saved:null;
    }catch(_){return null;}
  };
  const importButton=document.createElement('button');importButton.id='flex-add-differential';importButton.textContent='Agregar funci?n diferencial?';
  document.querySelector('.flex-actions').append(importButton);
  const picker=document.createElement('dialog');picker.className='layout-dialog';picker.id='flex-differential-dialog';
  picker.innerHTML='<h2>Agregar funci?n diferencial renal</h2><label>Adquisici?n <select id="flex-differential-source"></select></label><p id="flex-differential-info"></p><div class="layout-dialog-actions"><button id="flex-differential-cancel">Cancelar</button><button id="flex-differential-insert">Agregar resultado</button></div>';
  document.body.append(picker);let available=[];
  importButton.onclick=()=>{
    available=[...new Set(flex.assets.map(a=>a.acquisitionId||a.series))].map(id=>api.savedResult(id)).filter(Boolean);
    options(el('flex-differential-source'),available.map((r,i)=>[i,r.title]));
    el('flex-differential-info').textContent=available.length?'Se agregar? una copia del resultado calculado.':'No hay c?lculos vigentes. Calcula la funci?n diferencial en Visualizaci?n / An?lisis.';
    el('flex-differential-insert').disabled=!available.length;picker.showModal();
  };
  el('flex-differential-cancel').onclick=()=>picker.close();
  el('flex-differential-insert').onclick=()=>{
    const selected=available[Number(el('flex-differential-source').value)],saved=selected&&api.savedResult(selected.acquisitionId);if(!saved)return;
    const asset=flex.assets.find(a=>a.id===saved.assetIds[0]);let page=flexPage();
    if(!page||(page.study&&page.study!==asset.study)){page=flexNewPage(asset);flex.page=page.id;}
    const table={id:++flex.serial,x:20,y:PAGE.top+10,w:1160,h:0,size:13,color:'#111111',text:'Funci?n diferencial renal',measurementTable:{type:'differential',...JSON.parse(JSON.stringify(saved))}};
    page.texts.push(table);page.edited=true;flex.selectedText=table.id;flex.selected=null;
    picker.close();refreshFlexible();el('flex-message').textContent='Funci?n diferencial agregada. Puedes trasladar la tabla y exportarla en PNG.';
  };
  api.syncSelection=()=>{
    const id=dataset?window.GANTRY_FLEX_MEASUREMENTS.acquisition(dataset):null;
    if(id!==selectedAcquisition){dialog.hidden=true;clear();api.lastResult=null;}
  };
  api.open=()=>{
    window.GANTRY_PROCESSING_ANALYSIS.show(true);
    const id=window.GANTRY_FLEX_MEASUREMENTS.acquisition(dataset);
    selectedAcquisition=id;
    assets=flex.assets.filter(a=>(a.acquisitionId||a.series)===id&&!a.dynamicFrames&&['static','whole'].includes(a.kind));
    el('differential-acquisition').textContent=assets[0]?.seriesName||'Selecciona una adquisición finalizada con imágenes estáticas.';
    el('differential-method').value='single';render();dialog.hidden=false;dialog.scrollIntoView?.({behavior:'smooth',block:'start'});
  };
  el('differential-method').onchange=render;
  el('differential-close').textContent='Ocultar cálculo';
  el('differential-close').onclick=()=>{dialog.hidden=true;};
  el('differential-calculate').onclick=()=>{
    clear();try{
      for(const p of panels)p.rows=p.asset?window.GANTRY_PROCESSING_ANALYSIS.measurementRows(p.asset):[];
      if(panels.length===2&&panels[0].asset?.id===panels[1].asset?.id)throw Error('Selecciona imágenes anterior y posterior diferentes.');
      const views=panels.map(p=>({seconds:p.asset?.duration/1000,...Object.fromEntries(['right','left','rightBackground','leftBackground'].map(k=>[k,p.rows.find(r=>r.id===p[k].value)]))}));
      const result=calculate(views),host=el('differential-result');
      const heading=document.createElement('h3');heading.textContent='Derecho: '+format(result.right)+' % · Izquierdo: '+format(result.left)+' %';host.append(heading);
      const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:12px';
      const row=values=>{const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;td.style.cssText='border:1px solid #888;padding:5px';tr.append(td);}table.append(tr);};
      row(['Proyección','Riñón / ROI','Cuentas','Fondo estimado','Cuentas netas']);
      result.corrected.forEach((pair,i)=>pair.forEach((r,j)=>row([panels[i].asset.projection,(j?'Izquierdo':'Derecho')+' · '+r.name,format(r.total),r.corrected?format(r.background):'Sin corrección',format(r.net)])));
      host.append(table);api.lastResult=JSON.parse(JSON.stringify(result));
      const snapshot={acquisitionId:selectedAcquisition,title:el('differential-acquisition').textContent,assetIds:panels.map(p=>p.asset.id),signature:signature(panels.map(p=>p.asset)),projections:panels.map(p=>p.asset.projection),result:api.lastResult};
      try{localStorage.setItem(resultKey(selectedAcquisition),JSON.stringify(snapshot));}catch(_){el('differential-error').textContent='No se pudo guardar el resultado para P?gina flexible.';}

    }catch(error){el('differential-error').textContent=error.message;}
  };
})();

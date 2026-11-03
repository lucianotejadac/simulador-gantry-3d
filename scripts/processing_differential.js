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
  const dialog=document.createElement('dialog');dialog.id='differential-dialog';dialog.className='layout-dialog';dialog.style.width='min(850px,94vw)';
  dialog.innerHTML='<h2>Calcular función diferencial renal</h2><p id="differential-acquisition"></p><label>Método <select id="differential-method"><option value="single">Una proyección (habitualmente posterior)</option><option value="geometric">Media geométrica anterior / posterior</option></select></label><p>Selecciona ROI que incluyan cada riñón completo. Asigna derecha e izquierda según el paciente, no según el lado de la pantalla. Los fondos deben estar vinculados a sus ROI renales.</p><div id="differential-views"></div><p id="differential-error" role="alert" style="color:#900"></p><div id="differential-result" aria-live="polite"></div><p style="font-size:11px">Porcentaje = cuentas netas del riñón / suma de ambos × 100. Fondo = media del fondo × área de la ROI renal. La media geométrica usa √(tasa anterior × tasa posterior) por riñón. Las cuentas proceden de las imágenes originales, independientemente de las máscaras y del contraste. Es captación relativa, no filtrado glomerular absoluto.</p><p style="font-size:11px"><a href="https://snmmi.org/common/Uploaded%20files/Web/Clinical%20Practice/Procedure%20Standards/2021/SNMMI%20EANM%20DMSA%20guideline_final.pdf" target="_blank" rel="noopener">Método: guía SNMMI/EANM de DMSA</a></p><div class="layout-dialog-actions"><button id="differential-rois">Dibujar / revisar ROI</button><button id="differential-close">Cerrar</button><button id="differential-calculate">Calcular</button></div>';
  document.body.append(dialog);
  let assets=[],panels=[];
  const el=id=>document.getElementById(id),format=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
  function clear(){el('differential-error').textContent='';el('differential-result').replaceChildren();}
  function select(label,host){const row=document.createElement('label');row.style.cssText='display:block;margin:8px 0';row.append(document.createTextNode(label+' '));const node=document.createElement('select');node.style.maxWidth='100%';node.setAttribute('aria-label',label);row.append(node);host.append(row);return node;}
  function options(node,entries){node.replaceChildren();for(const [id,label]of entries){const option=document.createElement('option');option.value=id;option.textContent=label;node.append(option);}}
  function populate(panel){
    panel.asset=assets[Number(panel.image.value)];panel.rows=panel.asset?window.GANTRY_PROCESSING_ANALYSIS.measurementRows(panel.asset):[];
    for(const side of ['right','left']){
      options(panel[side],[['','Seleccionar ROI'],...panel.rows.filter(r=>r.use!=='background').map(r=>[r.id,r.name])]);
      backgrounds(panel,side);
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
  api.open=()=>{
    const id=window.GANTRY_FLEX_MEASUREMENTS.acquisition(dataset);
    assets=flex.assets.filter(a=>(a.acquisitionId||a.series)===id&&!a.dynamicFrames&&['static','whole'].includes(a.kind));
    el('differential-acquisition').textContent=assets[0]?.seriesName||'Selecciona una adquisición finalizada con imágenes estáticas.';
    el('differential-method').value='single';render();dialog.showModal();
  };
  el('differential-method').onchange=render;
  el('differential-close').onclick=()=>dialog.close();
  el('differential-rois').onclick=()=>{dialog.close();window.GANTRY_PROCESSING_ANALYSIS.show(true);};
  el('differential-calculate').onclick=()=>{
    clear();try{
      if(panels.length===2&&panels[0].asset?.id===panels[1].asset?.id)throw Error('Selecciona imágenes anterior y posterior diferentes.');
      const views=panels.map(p=>({seconds:p.asset?.duration/1000,...Object.fromEntries(['right','left','rightBackground','leftBackground'].map(k=>[k,p.rows.find(r=>r.id===p[k].value)]))}));
      const result=calculate(views),host=el('differential-result');
      const heading=document.createElement('h3');heading.textContent='Derecho: '+format(result.right)+' % · Izquierdo: '+format(result.left)+' %';host.append(heading);
      const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:12px';
      const row=values=>{const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;td.style.cssText='border:1px solid #888;padding:5px';tr.append(td);}table.append(tr);};
      row(['Proyección','Riñón / ROI','Cuentas','Fondo estimado','Cuentas netas']);
      result.corrected.forEach((pair,i)=>pair.forEach((r,j)=>row([panels[i].asset.projection,(j?'Izquierdo':'Derecho')+' · '+r.name,format(r.total),r.corrected?format(r.background):'Sin corrección',format(r.net)])));
      host.append(table);api.lastResult=JSON.parse(JSON.stringify(result));
    }catch(error){el('differential-error').textContent=error.message;}
  };
})();

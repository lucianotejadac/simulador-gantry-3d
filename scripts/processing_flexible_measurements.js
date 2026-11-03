/* Serializable measurement snapshots: the source acquisition is never modified. */
(function(){
  'use strict';
  const button=document.createElement('button');button.id='flex-add-measurements';button.textContent='Agregar mediciones…';
  document.querySelector('.flex-actions').append(button);
  const dialog=document.createElement('dialog');dialog.id='flex-measurements-dialog';dialog.className='layout-dialog';
  dialog.innerHTML='<h2>Tabla resumen de mediciones</h2><label>Adquisición <select id="flex-measurements-source"></select></label><p id="flex-measurements-info"></p><p>Se inserta una copia de las mediciones ROI actuales. Puedes trasladar la tabla sobre la página. Para reflejar cambios posteriores en las ROI, vuelve a agregarla.</p><div class="layout-dialog-actions"><button id="flex-measurements-cancel">Cancelar</button><button id="flex-measurements-insert">Agregar tabla</button></div>';
  document.body.append(dialog);
  const include=document.createElement('label');include.innerHTML='<input type="checkbox" id="flex-measurements-images" checked> Incluir imágenes con sus ROI';
  dialog.querySelector('.layout-dialog-actions').before(include);
  let groups=[];
  const rowsFor=group=>group.assets.flatMap(a=>window.GANTRY_PROCESSING_ANALYSIS.measurementRows(a));
  function acquisition(ds){try{const info=JSON.parse(value(ds,'00111010'));return info.processing?.acquisitionId||info.recordId||ds.string('x0020000e');}catch(_){return ds.string('x0020000e');}}
  function detector(ds){try{return JSON.parse(value(ds,'00111010')).detector;}catch(_){return null;}}
  function update(){const group=groups[Number($('flex-measurements-source').value)],rows=group?rowsFor(group):[];
    $('flex-measurements-info').textContent=rows.length?rows.length+' ROI con mediciones disponibles.':'Esta adquisición no tiene mediciones ROI. Agrégalas en Visualización / Análisis.';
    $('flex-measurements-insert').disabled=!rows.length;
  }
  button.onclick=()=>{
    const map=new Map();for(const a of flex.assets){const id=a.acquisitionId||a.series;if(!map.has(id))map.set(id,{id,assets:[]});const group=map.get(id);if(!group.assets.some(b=>b.uid===a.uid))group.assets.push(a);}
    groups=[...map.values()];const select=$('flex-measurements-source');select.replaceChildren();
    groups.forEach((g,i)=>{g.label=(i+1)+' · '+g.assets[0].seriesName.replace(/ · Detector \d+.*$/,'');const o=document.createElement('option');o.value=i;o.textContent=g.label;select.append(o);});
    const selected=flexAsset(flexItem()),index=groups.findIndex(g=>g.assets.includes(selected));if(index>=0)select.value=index;
    update();dialog.showModal();
  };
  $('flex-measurements-source').onchange=update;
  $('flex-measurements-cancel').onclick=()=>dialog.close();
  $('flex-measurements-insert').onclick=()=>{
    const group=groups[Number($('flex-measurements-source').value)],rows=group?rowsFor(group):[];if(!rows.length)return;
    let p=flexPage();if(!p){p=flexNewPage(group.assets[0]);flex.page=p.id;}
    let tableY=PAGE.top+10;
    if($('flex-measurements-images').checked){
      if(p.study&&p.study!==group.assets[0].study){p=flexNewPage(group.assets[0]);flex.page=p.id;}
      p.study=group.assets[0].study;p.meta=group.assets[0].meta;
      const measured=group.assets.filter(a=>window.GANTRY_PROCESSING_ANALYSIS.measurementRows(a).length);
      measured.forEach((a,n)=>{const item={id:++flex.serial,asset:a.id,x:24+22*n,y:PAGE.top+22*n,w:a.kind==='whole'?160:360,h:a.kind==='whole'?640:360,zoom:1,panX:0,panY:0,window:a.window,level:a.level,invert:!a.mono1};window.GANTRY_PROCESSING_ANALYSIS.prepareFlexible(item,a);boundsFlexible(item);p.items.push(item);});
      p.edited=true;
      if(measured.some(a=>a.kind==='whole')||rows.length>8){p=flexNewPage(group.assets[0]);flex.page=p.id;}
      else tableY=PAGE.top+400;
    }
    // Keep each table inside the printable page, even with many ROI.
    for(let start=0;start<rows.length;start+=16){
      if(start){p=flexNewPage(group.assets[0]);flex.page=p.id;}
      const t={id:++flex.serial,x:20,y:start?PAGE.top+10:tableY,w:1160,h:0,size:13,color:'#111111',text:'Mediciones · '+group.label,
        measurementTable:{acquisitionId:group.id,title:'Mediciones · '+group.label,rows:JSON.parse(JSON.stringify(rows.slice(start,start+16)))}};
      p.texts.push(t);p.edited=true;flex.selectedText=t.id;flex.selected=null;
    }
    dialog.close();refreshFlexible();$('flex-message').textContent='Tabla agregada. Arrástrala para ubicarla; se incluirá al exportar PNG.';
  };
  const columns=[['ROI',155],['Detector / uso',145],['Cuentas',105],['Media/píxel',100],['Máximo',85],['Área px',85],['Área mm²',100],['Referencia',145],['Fondo estimado',120],['Netas',100]];
  const format=n=>n==null?'—':Number(n).toLocaleString('es-CL',{maximumFractionDigits:2});
  const uses={measure:'Medir',background:'Fondo',exclude:'Ocultar',keep:'Conservar'};
  function draw(ctx,t){
    if(t.measurementTable.type==='differential'){drawDifferential(ctx,t);return;}
    const table=t.measurementTable;const width=columns.reduce((s,c)=>s+c[1],0),rowH=32;
    t.w=width;t.h=70+rowH*table.rows.length;t.x=clamp(t.x,0,PAGE.w-width);t.y=clamp(t.y,PAGE.top,PAGE.bottom-t.h);
    ctx.fillStyle='white';ctx.fillRect(t.x,t.y,t.w,t.h);ctx.fillStyle='#000080';canvasText(ctx,table.title,t.x+6,t.y+20,width-12,'bold 16px Arial');
    const cells=(values,y,header=false)=>{let x=t.x;columns.forEach(([,w],i)=>{ctx.fillStyle=header?'#e1e5ee':'#fff';ctx.fillRect(x,y,w,rowH);ctx.strokeStyle='#888';ctx.lineWidth=.6;ctx.strokeRect(x,y,w,rowH);ctx.fillStyle='#111';headerText(ctx,String(values[i]),x+5,y+20,w-10,(header?'bold ':'')+'12px Arial');x+=w;});};
    cells(columns.map(c=>c[0]),t.y+30,true);
    table.rows.forEach((r,i)=>cells([r.name,'D'+r.detector+' · '+(uses[r.use]||r.use),format(r.total),format(r.mean),format(r.max),format(r.pixels),format(r.areaMm2),r.reference||'—',format(r.estimated),format(r.net)],t.y+62+i*rowH));
  }
  function drawDifferential(ctx,t){
    const data=t.measurementTable,result=data.result,rows=[];
    result.corrected.forEach((pair,i)=>pair.forEach((r,j)=>rows.push([data.projections[i],(j?'Izquierdo':'Derecho')+' ? '+r.name,format(r.total),r.corrected?format(r.background):'Sin correcci?n',format(r.net)])));
    const widths=[200,320,200,220,220];t.w=1160;t.h=142+32*rows.length;
    t.x=clamp(t.x,0,PAGE.w-t.w);t.y=clamp(t.y,PAGE.top,PAGE.bottom-t.h);
    ctx.fillStyle='white';ctx.fillRect(t.x,t.y,t.w,t.h);ctx.fillStyle='#000080';
    canvasText(ctx,'Funci?n diferencial renal ? '+data.title,t.x+8,t.y+24,t.w-16,'bold 16px Arial');
    canvasText(ctx,'Derecho: '+format(result.right)+' %    Izquierdo: '+format(result.left)+' %',t.x+8,t.y+53,t.w-16,'bold 20px Arial');
    canvasText(ctx,result.method==='geometric'?'Media geom?trica anterior / posterior':'Una proyecci?n',t.x+8,t.y+77,t.w-16,'14px Arial');
    [['Proyecci?n','Ri??n / ROI','Cuentas','Fondo estimado','Cuentas netas'],...rows].forEach((values,i)=>{let x=t.x;values.forEach((v,j)=>{ctx.fillStyle=i?'#fff':'#e1e5ee';ctx.fillRect(x,t.y+88+i*32,widths[j],32);ctx.strokeStyle='#888';ctx.strokeRect(x,t.y+88+i*32,widths[j],32);ctx.fillStyle='#111';headerText(ctx,String(v),x+5,t.y+109+i*32,widths[j]-10,'12px Arial');x+=widths[j];});});
    canvasText(ctx,'Captaci?n relativa ? Resultado guardado al agregar la tabla',t.x+8,t.y+t.h-7,t.w-16,'12px Arial');
  }
  const oldEditor=openTextEditor;openTextEditor=function(edit=false){const t=flexPage()?.texts.find(t=>t.id===flex.selectedText);if(edit&&t?.measurementTable){$('flex-message').textContent='Tabla de mediciones guardadas. Para actualizarla, quítala y agrega una nueva.';return;}return oldEditor(edit);};
  const oldTools=syncLayoutTools;syncLayoutTools=function(){oldTools();const table=flexPage()?.texts.find(t=>t.id===flex.selectedText)?.measurementTable;$('flex-text-edit').disabled=!!table||$('flex-text-edit').disabled;$('flex-text-remove').textContent=table?'Quitar tabla':'Quitar texto';};
  window.GANTRY_FLEX_MEASUREMENTS={acquisition,detector,draw};
})();

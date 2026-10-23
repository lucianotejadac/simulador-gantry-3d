/* Appended to the vendored viewer; all viewer APIs remain local to this frame. */
(function(){
  'use strict';
  let receiving=false;
  // Keep the native acquisition menu, with readable detector names instead of file UUIDs.
  if(typeof updateModeUI==='function'){
    const originalUpdate=updateModeUI;
    updateModeUI=function(){
      originalUpdate();
      for(const key of Object.keys(acquisitionInstances)){
        const states=Object.values(acquisitionInstances[key]);
        if(!states.length||!states.every(s=>s.dataset?.string('x00110010')==='GANTRY_SIMULATION'))continue;
        const names=states.map(s=>(value(s.dataset,'0008103e')||s.filename).replace(/^(Estática|Cuerpo entero) · /,'').replace(/ · SIMULADO$/,''));
        const date=states[0].dataset.string('x00080022')||states[0].dataset.string('x00080020')||'';
        $('file-'+key).textContent=names.join(' / ')+(date?' · '+date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$3/$2/$1'):'');
        $('mode-'+key).title=$('file-'+key).textContent;
      }
      const picker=$('acquisition-instance');
      if(picker)for(const option of picker.options){
        const s=acquisitionInstances[currentAcquisition]?.[option.value];
        if(s?.dataset?.string('x00110010')==='GANTRY_SIMULATION')option.textContent=value(s.dataset,'0008103e').replace(/ · SIMULADO$/,'');
      }
    };
  }
  for(const key of ['zoom','window','level'])$('flex-'+key).oninput=e=>updateFlexImage(key,e.target.value);
  const reply=data=>parent.postMessage({...data,version:1},location.origin);
  function check(file){
    if(!(file.bytes instanceof ArrayBuffer)||file.bytes.byteLength>68*1024*1024)throw Error('Tamaño de imagen no válido.');
    const ds=dicomParser.parseDicom(new Uint8Array(file.bytes)),r=ds.uint16('x00280010'),c=ds.uint16('x00280011'),bits=ds.uint16('x00280100'),pixel=ds.elements.x7fe00010;
    if(ds.string('x00110010')!=='GANTRY_SIMULATION')throw Error('Sólo se admiten adquisiciones de este simulador.');
    const frames=Number(ds.string('x00280008')||1);
    if(!Number.isInteger(frames)||frames<1||frames>1440||frames!==(file.frames||1)||!pixel||![16,32].includes(bits)||r!==file.rows||c!==file.cols||r*c>1024*1024*6||pixel.length!==r*c*frames*bits/8||ds.string('x00080018')!==file.uid)throw Error('Matriz o identificador no válido.');
    const view=new DataView(ds.byteArray.buffer,ds.byteArray.byteOffset+pixel.dataOffset,pixel.length);
    let total=0;for(let i=0;i<r*c*frames;i++)total+=bits===16?view.getUint16(i*2,true):view.getUint32(i*4,true);
    if(total!==file.total)throw Error('Las cuentas recibidas no coinciden con el original.');
    return {file,ds,total};
  }
  function addPage(pair){
    const assets=pair.map(x=>flex.assets.find(a=>a.uid===x.file.uid));
    if(assets.some(a=>!a))throw Error('El visor no pudo leer una imagen.');
    if(assets.every(a=>flex.pages.some(p=>p.items.some(i=>i.asset===a.id))))return;
    const empty=flex.pages.find(p=>!p.edited&&!p.items.length&&!p.texts?.length&&!p.header);
    const page=empty||flexNewPage(assets[0]);
    if(empty){page.study=assets[0].study;page.meta=assets[0].meta;page.header=copyFlexHeader(flex.header);}
    for(const a of assets){const item={id:++flex.serial,asset:a.id,x:24,y:PAGE.top,w:360,h:a.rows/a.cols>2?640:360,zoom:1,panX:0,panY:0,window:a.window,level:a.level,invert:true};page.items.push(item);}
    arrangeFlexible(page);page.edited=true;flex.page=page.id;flex.selected=page.items[0].id;
  }
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.version!==1)return;
    const data=event.data;
    if(data.type==='GANTRY_PROCESSING_HIDE'){stopDynamic();return;}
    if(data.type!=='GANTRY_PROCESSING_IMPORT')return;
    if(receiving){reply({type:'GANTRY_PROCESSING_RESULT',id:data.id,error:'Hay otra importación en curso.'});return;}
    receiving=true;
    try{
      if(!Array.isArray(data.files)||!data.files.length||data.files.length>100)throw Error('Selecciona entre 1 y 50 adquisiciones.');
      const batch=data.files.map(check);
      window.GANTRY_PROCESSING_EDITOR?.finish();
      for(const entry of batch){await loadFile(new File([entry.file.bytes],entry.file.name),entry.ds);if(!flex.assets.some(a=>a.uid===entry.file.uid))throw Error('Error al cargar '+entry.file.name);}
      if(!flex.header)flex.header=Object.fromEntries(Object.entries({patient:'Fantoma ICRP 145 · SIMULADO',rut:'',date:'',exam:'Cintigrafía ósea simulada',institution:'Simulador gantry'}).map(([key,value])=>[key,{value,show:!!value}]));
      // Receiving acquisitions only fills the image library. Compose a page
      // exclusively for the explicit "Componer seleccionadas" command.
      if(data.view==='flex'){
        const groups=new Map();for(const item of batch){if(!groups.has(item.file.group))groups.set(item.file.group,[]);groups.get(item.file.group).push(item);}
        for(const group of groups.values())addPage(group);
      }
      if(data.view==='acquisition'){
        const first=batch[0].file.uid;
        const key=Object.keys(acquisitionInstances).find(k=>acquisitionInstances[k][first]);
        if(key)selectMode(key,first);
        refreshFlexible();
      }else{openFlexible();refreshFlexible();}
      $('flex-message').textContent='Adquisiciones simuladas del gantry. Cuentas originales verificadas. Guarda el proyecto para conservar el procesamiento.';
      reply({type:'GANTRY_PROCESSING_RESULT',id:data.id,images:batch.length,totals:batch.map(x=>x.total)});
    }catch(error){reply({type:'GANTRY_PROCESSING_RESULT',id:data.id,error:error.message});}
    finally{receiving=false;}
  });
  reply({type:'GANTRY_PROCESSING_READY'});
})();

/* Browser-only, lossless teaching interchange. No screenshots or resampling. */
(function(){
  'use strict';
  const NM='1.2.840.10008.5.1.4.1.1.20',PRIVATE32='2.25.216145721041023267506752105223475669900';
  const encoder=new TextEncoder();
  const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
  function element(tag,vr,value){
    let data;
    if(value instanceof Uint8Array)data=value;
    else if(['US','UL','AT'].includes(vr)){
      const values=Array.isArray(value)?value:[value],size=vr==='US'?2:4;
      data=new Uint8Array(size*values.length);const view=new DataView(data.buffer);
      values.forEach((n,i)=>vr==='US'?view.setUint16(i*size,n,true):vr==='AT'?(view.setUint16(i*4,n>>>16,true),view.setUint16(i*4+2,n&65535,true)):view.setUint32(i*size,n,true));
    }else data=encoder.encode(String(vr==='DS'&&typeof value==='number'?Number(value.toPrecision(10)):value??''));
    if(data.length%2)data=concat([data,new Uint8Array([vr==='UI'||vr==='OB'||vr==='OW'?0:32])]);
    const long=['OB','OW','SQ','UT'].includes(vr),header=new Uint8Array(long?12:8),v=new DataView(header.buffer);
    v.setUint16(0,parseInt(tag.slice(0,4),16),true);v.setUint16(2,parseInt(tag.slice(4),16),true);
    header.set(encoder.encode(vr),4);long?v.setUint32(8,data.length,true):v.setUint16(6,data.length,true);
    return concat([header,data]);
  }
  function dataset(elements){return concat(elements.sort((a,b)=>a[0].localeCompare(b[0])).map(e=>element(...e)));}
  function sequence(tag,items){return [tag,'SQ',concat(items.map(elements=>{const body=dataset(elements),header=new Uint8Array(8),v=new DataView(header.buffer);v.setUint16(0,0xfffe,true);v.setUint16(2,0xe000,true);v.setUint32(4,body.length,true);return concat([header,body]);}))];}
  async function uid(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));let n=0n;for(const b of bytes.subarray(0,16))n=n*256n+BigInt(b);return '2.25.'+n;}
  function validate(record){
    window.GANTRY_BONE_STORAGE.validate(record);
    if(record.study!=='bone'||!record.finished||record.heads.some(h=>h.total===0))throw Error('Selecciona una adquisición ósea finalizada con cuentas en ambos detectores.');
  }
  function label(record,j){
    const p=record.processing;
    if(!p)return 'D'+(j+1)+' · orientación no registrada';
    if(p.varied)return 'D'+(j+1)+' · geometría variable';
    const d=(record.kind==='whole'?p.last:p.first)?.detectors?.[j];
    return 'D'+(j+1)+' · '+(d?.view||'orientación no registrada')+(d?.orientationMatched===false?' · posición declarada discordante':'');
  }
  async function files(record,studyUID){
    validate(record);
    const identity=(record.processing?.acquisitionId||record.id)+':'+record.heads.map(h=>h.total+':'+h.elapsed).join(':'),seriesUID=await uid('series:'+identity);
    const settings=record.processing?.first?.settings||record.settings||{},mdp=record.mdp?.start;
    const when=new Date(record.processing?.startedAt||record.createdAt),stamp=when.toISOString().replace(/[-:]/g,''),date=stamp.slice(0,8),time=stamp.slice(9,15);
    const output=[];
    for(let j=0;j<2;j++){
      const head=record.heads[j],orientation=label(record,j),sopUID=await uid(identity+':'+j);
      let max=0;for(const n of head.counts)max=Math.max(max,n);
      // Standard NM allows 8/16-bit pixels. Preserve rare overflow images with
      // an explicitly private teaching SOP class, never clamp or quantize counts.
      const bits=max<=65535?16:32,sop=bits===16?NM:PRIVATE32;
      const data=new Uint8Array(head.counts.length*bits/8),view=new DataView(data.buffer);
      head.counts.forEach((n,i)=>bits===16?view.setUint16(i*2,n,true):view.setUint32(i*4,n,true));
      const info={simulation:true,recordId:record.id,detector:j+1,total:head.total,elapsed:head.elapsed,
        acquisition:{kind:record.kind||'static',mode:record.mode,target:record.target,names:record.names},
        mdp:record.mdp||null,settings,processing:record.processing||null,scan:record.scan||null,
        stoppedEarly:!head.done,encoding:bits===16?'NM16':'PRIVATE_GANTRY_COUNTS32'};
      const description=(record.kind==='whole'?'Cuerpo entero':'Estática')+' · '+record.names[j]+' · SIMULADO';
      const tags=[['00080005','CS','ISO_IR 192'],['00080008','CS','DERIVED\\SECONDARY\\'+(record.kind==='whole'?'WHOLE BODY':'STATIC')+'\\SIMULATED'],
        ['00080016','UI',sop],['00080018','UI',sopUID],['00080020','DA',date],['00080030','TM',time],['00080022','DA',date],['00080032','TM',time],['00080201','SH','+0000'],['00080050','SH',''],
        ['00080060','CS','NM'],['00080070','LO','Gantry educativo'],['00080080','LO','Simulación docente'],['00080090','PN',''],
        ['00081030','LO','Cintigrafía ósea simulada ICRP 145'],['0008103e','LO',description.slice(0,64)],
        ['00100010','PN','FANTOMA^ICRP145^SIMULADO'],['00100020','LO','GANTRY-ICRP145-SIM'],['00100030','DA',''],['00100040','CS',''],
        ['00111010','UT',JSON.stringify(info)],['00110010','LO','GANTRY_SIMULATION'],
        ['00181020','LO','Gantry processing 1'],['00181242','IS',Math.round(head.elapsed*1000)],
        ['0020000d','UI',studyUID],['0020000e','UI',seriesUID],['00200010','SH','SIMULATED'],['00200011','IS','1'],['00200013','IS',j+1],
        ['00204000','LT','SIMULADO; '+orientation+'; '+head.total+' cuentas; '+(mdp?(mdp.activityMBq/37).toFixed(2)+' mCi; inyección-examen '+(mdp.seconds/60).toFixed(2)+' min; ':'')+(record.processing?.varied?'Parámetros variables durante la adquisición. ':'')+(!head.done?'Adquisición detenida antes de la meta. ':'')+(bits===32?'SOP privado docente de 32 bits; no es NM estándar.':'')],
        ['00280002','US',1],['00280004','CS','MONOCHROME2'],['00280008','IS',1],['00280009','AT',0x00540020],
        ['00280010','US',record.height||record.n],['00280011','US',record.n],['00280030','DS',''],
        ['00280100','US',bits],['00280101','US',bits],['00280102','US',bits-1],['00280103','US',0],
        ['00281050','DS',max/2],['00281051','DS',Math.max(1,max)],['00281052','DS','0'],['00281053','DS','1'],
        ['00540020','US',1],['00540021','US',1],
        sequence('00540022',[[['00181180','SH',settings.collimator||''],['00280031','DS',String(settings.zoom||1)+'\\'+String(settings.zoom||1)],
          sequence('00540220',[[['00080100','SH','D'+(j+1)],['00080102','SH','99GANTRY'],['00080104','LO',orientation.slice(0,64)]]])]]),
        ['7fe00010','OW',data]];
      const center=Number(settings.energyCenter),width=Number(settings.windowWidth);
      if(center>0&&width>0)tags.push(['00540010','US',1],['00540011','US',1],sequence('00540012',[[['00540018','SH','99mTc'],sequence('00540013',[[['00540014','DS',center*(1-width/200)],['00540015','DS',center*(1+width/200)]]])]]));
      if(mdp)tags.push(sequence('00540016',[[['00180031','LO','99mTc-MDP'],['00181074','DS',mdp.activityMBq],['00181075','DS',mdp.halfLifeMinutes*60]]]));
      if(record.scan)tags.push(['00181300','DS',record.scan.velocity/6],['00181302','DS',record.scan.travel*10]);
      const meta=dataset([['00020001','OB',new Uint8Array([0,1])],['00020002','UI',sop],['00020003','UI',sopUID],['00020010','UI','1.2.840.10008.1.2.1'],['00020012','UI',PRIVATE32],['00020013','SH','GANTRY_SIM_1']]);
      const prefix=new Uint8Array(132);prefix.set(encoder.encode('DICM'),128);
      const bytes=concat([prefix,element('00020000','UL',meta.length),meta,dataset(tags)]);
      output.push({name:'oseo-'+record.id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,48)+'-D'+(j+1)+'.dcm',bytes:bytes.buffer,total:head.total,rows:record.height||record.n,cols:record.n,uid:sopUID,group:identity,orientation});
    }
    return output;
  }
  window.GANTRY_PROCESSING_DICOM={files,uid,label,validate,PRIVATE32};
})();

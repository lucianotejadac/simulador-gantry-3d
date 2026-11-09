/* Flexible pages reuse registration or the immutable identity of their study. */
(function(){
  'use strict';
  let registrationSeen=false,registeredHeader=null;
  const text=value=>String(value||'').trim();
  function header(meta){
    if(!meta)return null;
    const patient=meta.patient==='Paciente: sin dato'?'':text(meta.patient);
    const exam=meta.exam==='Examen: sin dato'?'':text(meta.exam);
    if(!patient&&!meta.patientId&&!exam)return null;
    return Object.fromEntries(Object.entries({patient,rut:text(meta.patientId),date:text(meta.date),exam,
      institution:text(meta.institution)||'Simulador gantry'}).map(([key,value])=>[key,{value,show:!!value}]));
  }
  function sync(){
    flex.header=copyFlexHeader(registrationSeen?registeredHeader:header(flex.assets[0]?.meta));
    // Once images or a result table bind a page to a study, later registration
    // edits/patient changes must not relabel the already acquired material.
    for(const page of flex.pages)page.header=header(page.meta)||copyFlexHeader(flex.header);
  }
  const refresh=refreshFlexible;
  refreshFlexible=function(){sync();return refresh.apply(this,arguments);};
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.version!==1)return;
    const d=event.data;
    const patient=['GANTRY_ADMINISTRATION_STATE','GANTRY_REGISTRATION_EDITED'].includes(d.type)?d.patient:
      d.type==='GANTRY_ACQUIRE_CONFIG'?d.config?.patient:null;
    if(!patient)return;
    const next=patient.fullName?header({patient:patient.fullName,patientId:patient.rut,exam:patient.examName,
      date:new Date().toLocaleDateString('es-CL'),institution:'Simulador gantry'}):null;
    if(registrationSeen&&JSON.stringify(next)===JSON.stringify(registeredHeader))return;
    registrationSeen=true;registeredHeader=next;refreshFlexible();
  });
  sync();
})();

/* One entered identity per simulated patient in this workspace session. */
(function(){
  'use strict';
  const entries=new Map();let dialog,form,pending=null,resolvePending=null,owner=null,previousFocus,confirmation;
  const id=()=>window.GANTRY_PATIENT?.id||'phantom';
  const current=(key=id())=>entries.has(key)?{...entries.get(key)}:null;
  function build(){
    if(dialog)return;
    const style=document.createElement('style');style.textContent=`
      #patientRegistration{box-sizing:border-box;width:min(560px,94vw);max-height:92vh;overflow:auto;background:#c0c0c0;color:#161616;border:3px outset #eee;padding:0;font:15px/1.4 Arial}
      #patientRegistration::backdrop{background:#081624b8}#patientRegistration header{display:flex;align-items:center;justify-content:space-between;background:#132b50;color:white;padding:10px 12px;gap:20px}
      #patientRegistration h2{font-size:19px;margin:0}#patientRegistrationClose{font:24px/1 Arial;min-width:32px;min-height:30px;cursor:pointer}
      #patientRegistration form{padding:16px 20px}#patientRegistration p{margin:0 0 14px}#patientRegistration label{display:block;margin:12px 0;font-weight:bold}
      #patientRegistration input{box-sizing:border-box;display:block;width:100%;margin-top:5px;padding:8px;font:16px Arial;border:2px inset #eee;background:#ffffe1;color:#111;min-height:38px}
      #patientRegistration input:focus{outline:2px solid #164f8c}#patientRegistration .registration-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:18px}
      #patientRegistration .registration-actions button{padding:8px 14px;font:15px Arial;cursor:pointer}#patientRegistrationSave{font-weight:bold;color:#000080}
      #patientRegistrationError{color:#8c1200;font-weight:bold}#patientRegistrationError:empty{display:none}`;document.head.append(style);
    dialog=document.createElement('dialog');dialog.id='patientRegistration';dialog.setAttribute('aria-labelledby','patientRegistrationTitle');
    dialog.innerHTML=`<header><h2 id="patientRegistrationTitle">Datos del paciente y del examen</h2><button type="button" id="patientRegistrationClose" aria-label="Cancelar registro del paciente">×</button></header>
      <form novalidate><p id="patientRegistrationContext"></p><p id="patientRegistrationHelp"></p><button type="button" id="registrationViewBand">Ver pulsera</button>
      <label>Nombre completo<input id="registration-fullName" name="fullName" type="text" required maxlength="64" autocomplete="off"></label>
      <label>RUT<input id="registration-rut" name="rut" type="text" required maxlength="12" placeholder="12.345.678-5" autocomplete="off"></label>
      <label>Nombre del examen<input id="registration-examName" name="examName" type="text" required maxlength="64" autocomplete="off"></label>
      <p id="patientRegistrationError" role="alert"></p><div class="registration-actions"><button type="button" id="patientRegistrationCancel">Cancelar</button><button type="submit" id="patientRegistrationSave">Guardar y continuar</button></div></form>`;
    document.body.append(dialog);form=dialog.querySelector('form');
    for(const key of ['patientRegistrationClose','patientRegistrationCancel'])document.getElementById(key).onclick=()=>dialog.close('cancel');
    document.getElementById('registrationViewBand').onclick=()=>window.GANTRY_PATIENT_RECORDS?.open('band',dialog);
    dialog.addEventListener('close',()=>{window.GANTRY_PATIENT_RECORDS?.closeRegistrationBand?.();const resolve=resolvePending;resolvePending=null;pending=null;owner=null;previousFocus?.focus?.();resolve?.(dialog.returnValue==='saved');});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(owner!==id()){dialog.close('cancel');return;}
      const raw=Object.fromEntries(new FormData(form));
      try{
        const value=window.GANTRY_PROCESSING_CONFIG.registration(raw);
        entries.set(owner,{...value,registrationId:crypto.randomUUID()});
        window.dispatchEvent(new CustomEvent('gantry-registration-change',{detail:{patientId:owner}}));
        dialog.close('saved');
      }catch(error){document.getElementById('patientRegistrationError').textContent=error.message;form.elements.namedItem(error.field)?.focus();}
    });
    form.addEventListener('input',()=>{document.getElementById('patientRegistrationError').textContent='';});
    window.addEventListener('gantry-patient-change',()=>{if(dialog.open&&owner!==id())dialog.close('cancel');});
  }
  function enter(editing=false){
    if(pending)return pending;
    build();form.reset();dialog.returnValue='';owner=id();previousFocus=document.activeElement;
    if(editing)for(const key of ['fullName','rut','examName'])form.elements.namedItem(key).value=current()?.[key]||'';
    document.getElementById('patientRegistrationTitle').textContent=editing?'Modificar datos del paciente y del examen':'Datos del paciente y del examen';
    document.getElementById('patientRegistrationHelp').textContent=editing?'Los cambios se aplicarán a las adquisiciones pendientes y a las nuevas de este paciente. Las imágenes ya adquiridas conservarán sus datos.':'Completa los datos antes de agregar la primera adquisición. Se conservarán para las siguientes adquisiciones de este paciente en la sesión.';
    document.getElementById('patientRegistrationSave').textContent=editing?'Guardar cambios':'Guardar y continuar';
    document.getElementById('patientRegistrationContext').textContent='Paciente seleccionado: '+(window.GANTRY_PATIENT?.metadata()?.name||'Fantoma ICRP 145');
    document.getElementById('patientRegistrationError').textContent='';
    pending=new Promise(resolve=>{resolvePending=resolve;});dialog.showModal();document.getElementById('registration-fullName').focus();return pending;
  }
  function ensure(){return current()?Promise.resolve(true):enter();}
  async function edit(){
    if(pending||confirmation?.open)return false;
    const patientId=id();
    if(!confirmation){
      confirmation=document.createElement('dialog');confirmation.id='patientRegistrationConfirm';confirmation.setAttribute('aria-labelledby','registrationConfirmTitle');
      confirmation.style.cssText='max-width:420px;background:#c0c0c0;border:3px outset #eee;color:#111;padding:18px;font:15px/1.5 Arial';
      confirmation.innerHTML='<h2 id="registrationConfirmTitle">¿Deseas modificar los datos?</h2><p>Podrás corregir el nombre completo, el RUT y el nombre del examen de las adquisiciones pendientes.</p><button type="button" id="registrationEditCancel">Cancelar</button> <button type="button" id="registrationEditConfirm">Sí, modificar datos</button>';
      document.body.append(confirmation);
      document.getElementById('registrationEditCancel').onclick=()=>confirmation.close('cancel');
      document.getElementById('registrationEditConfirm').onclick=()=>confirmation.close('edit');
    }
    const confirmed=new Promise(resolve=>confirmation.addEventListener('close',()=>resolve(confirmation.returnValue==='edit'),{once:true}));
    confirmation.returnValue='';confirmation.showModal();document.getElementById('registrationEditCancel').focus();
    return await confirmed&&patientId===id()?enter(true):false;
  }
  // Legacy gantry controls follow the same registration rule as the Examen menu.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#boneAcqStart,#boneAcqBegin,#boneAcqInstant,#startMAG3,#injectMAG3Instant');
    if(!button||button.disabled||current())return;
    event.preventDefault();event.stopImmediatePropagation();ensure().then(ok=>{if(ok&&button.isConnected&&!button.disabled)button.click();});
  },true);
  document.addEventListener('submit',event=>{
    if(event.target.id!=='boneAcqSetup'||current())return;
    event.preventDefault();event.stopImmediatePropagation();ensure().then(ok=>{if(ok)event.target.requestSubmit();});
  },true);
  window.GANTRY_PATIENT_REGISTRATION={ensure,current,edit};
})();

/* Synthetic identification and clinical records. Opening a record never changes the exam. */
(function(){
  'use strict';
  const data=window.GANTRY_PATIENT_RECORD_DATA;
  const fullName=p=>[...p.givenNames,...p.surnames].join(' ');
  const current=()=>data.patients[window.GANTRY_PATIENT?.id]||data.patients.phantom;
  let dialog,body,title,bandLayer,returnFocus,view='band';
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(text,action,cls){const b=el('button',text,cls);b.type='button';b.onclick=action;return b;}
  function definition(parent,items){const dl=el('dl',undefined,'patient-record-fields');for(const [label,value] of items)dl.append(el('dt',label),el('dd',value));parent.append(dl);}
  function identity(p){const section=el('section',undefined,'patient-record-identity');section.append(el('h3',fullName(p)));definition(section,[['RUT ficticio',p.rut],['Paciente',p.label],['Edad / sexo',p.age+' años · '+p.sex],['Ficha docente',p.record]]);return section;}
  function render(){
    const p=current();body.replaceChildren();title.textContent=view==='band'?'Pulsera de identificación':'Carpeta del paciente';
    dialog.classList.toggle('patient-record-band-dialog',view==='band');
    if(view==='band'){
      const zoom=el('div',undefined,'patient-band-zoom'),strap=el('div',undefined,'patient-band-strap'),label=el('div',undefined,'patient-band-label');
      label.append(el('span','SIMULADO · IDENTIFICACIÓN','patient-band-mark'),el('strong',p.givenNames.join(' ')),el('strong',p.surnames.join(' ')),el('span','RUT '+p.rut,'patient-band-rut'));
      const barcode=el('div',undefined,'patient-band-barcode');barcode.setAttribute('aria-hidden','true');label.append(barcode,el('small',p.record+' · '+p.label));strap.append(label);zoom.append(strap);body.append(zoom,el('p','Pulsera ampliada · '+fullName(p),'patient-record-caption'));
    }else{
      body.append(identity(p));const nav=el('nav',undefined,'patient-record-tabs');nav.setAttribute('aria-label','Contenido de la carpeta');
      for(const [v,text] of [['order','Orden médica'],['history','Antecedentes y exámenes']]){const b=button(text,()=>{view=v;render();body.querySelector('[aria-pressed="true"]').focus();});b.setAttribute('aria-pressed',String(view===v));nav.append(b);}body.append(nav);
      if(view==='order'){
        const sheet=el('article',undefined,'patient-record-sheet');sheet.append(el('div','MEDICINA NUCLEAR · ORDEN SIMULADA','patient-record-stamp'),el('h3',p.order.exam));
        definition(sheet,[['Servicio solicitante',p.order.service],['Profesional',p.order.physician],['Fecha relativa',p.order.date]]);
        for(const [heading,text] of [['Motivo de solicitud',p.order.reason],['Pregunta clínica',p.order.question],['Estudio solicitado',p.order.plan]])sheet.append(el('h4',heading),el('p',text));body.append(sheet);
      }else{
        const history=el('section',undefined,'patient-record-sheet');history.append(el('h3','Antecedentes clínicos'));const ul=el('ul');p.history.forEach(t=>ul.append(el('li',t)));history.append(ul);body.append(history);
        for(const exam of p.exams){const article=el('article',undefined,'patient-record-sheet');article.append(el('h3',exam.title),el('p',exam.date+' · respecto del examen simulado','patient-record-date'));
          if(exam.rows){const table=el('table'),head=el('thead'),hr=el('tr');for(const h of ['Examen','Resultado','Referencia ilustrativa'])hr.append(el('th',h));head.append(hr);const tb=el('tbody');for(const row of exam.rows){const tr=el('tr');for(const value of row)tr.append(el('td',value));tb.append(tr);}table.append(head,tb);article.append(table);}
          article.append(el('p',exam.report));body.append(article);
        }
      }
      const details=el('details',undefined,'patient-record-sources');details.append(el('summary','Fundamento de los casos y fuentes'));details.append(el('p','Los informes y cifras son ejemplos inventados. Las fuentes sustentan el contexto clínico, no los resultados de estos pacientes.'));
      if(p.provenance)details.append(el('p',p.provenance));
      for(const id of p.sources){const s=data.sources.find(x=>x.id===id),pnode=el('p'),link=el('a',s.title);link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';pnode.append(link,el('span',' — '+s.note));details.append(pnode);}body.append(details);
    }
    body.append(el('p',data.notice,'patient-record-notice'));body.scrollTop=0;
  }
  function ensureDialog(){
    if(dialog)return;
    bandLayer=el('div',undefined,'patient-band-layer');bandLayer.id='patientBandLayer';bandLayer.hidden=true;
    document.getElementById('g3dStage').append(bandLayer);
    bandLayer.addEventListener('click',event=>{if(event.target===bandLayer)dialog.close();});
    dialog=el('dialog',undefined,'patient-record-dialog');dialog.id='patientRecordDialog';dialog.setAttribute('aria-labelledby','patientRecordTitle');
    const header=el('header');title=el('h2');title.id='patientRecordTitle';const close=button('×',()=>dialog.close(),'patient-record-close');close.setAttribute('aria-label','Cerrar ventana del paciente');header.append(title,close);
    body=el('div',undefined,'patient-record-body');dialog.append(header,body);document.body.append(dialog);
    dialog.addEventListener('close',()=>{if(dialog.open)return;bandLayer.hidden=true;if(returnFocus?.isConnected)returnFocus.focus();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&dialog.open&&view==='band'&&!document.querySelector('dialog:modal')){event.preventDefault();dialog.close();}});
    window.addEventListener('gantry-patient-change',()=>{if(dialog.open)render();});
  }
  function open(next='band'){
    ensureDialog();const band=next==='band';
    if(dialog.open&&band!==(view==='band'))dialog.close();
    view=band?'band':'order';render();
    const host=band?bandLayer:document.body;
    if(dialog.parentNode!==host)host.append(dialog);
    bandLayer.hidden=!band;dialog.setAttribute('aria-modal',String(!band));
    if(!dialog.open){returnFocus=document.activeElement;if(band)dialog.show();else dialog.showModal();}
    dialog.querySelector('.patient-record-close').focus();
    window.dispatchEvent(new CustomEvent('gantry-patient-record-open',{detail:{patientId:window.GANTRY_PATIENT?.id,view}}));
  }
  function mountControls(panel){
    if(panel.querySelector('.patient-record-actions'))return;
    const actions=el('span',undefined,'patient-record-actions');
    const folder=button('📁 Carpeta',()=>open('order'));folder.setAttribute('aria-label','Abrir carpeta del paciente');folder.title='Orden médica, antecedentes y exámenes';actions.append(folder);panel.querySelector('label').after(actions);
  }
  window.GANTRY_PATIENT_RECORDS={open,mountControls,closeBand(){if(dialog?.open&&view==='band')dialog.close();},identity:()=>({fullName:fullName(current()),rut:current().rut,record:current().record})};
})();

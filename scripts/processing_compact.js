// Keep file/project actions available without the embedded viewer title bar.
(()=>{
  const bar=document.querySelector('.application-bar');
  const menu=document.createElement('select');
  menu.id='processingFileMenu';menu.setAttribute('aria-label','Archivo y herramientas');
  menu.innerHTML='<option value="" disabled selected>Archivo y herramientas…</option>';
  for(const id of ['open','open-folder','save-project','open-project','open-tutorial']){
    const button=document.getElementById(id);
    if(button){const option=document.createElement('option');option.value=id;option.textContent=button.textContent;menu.append(option);}
  }
  menu.onchange=()=>{const id=menu.value;menu.value='';document.getElementById(id)?.click();};
  bar.append(menu);
})();

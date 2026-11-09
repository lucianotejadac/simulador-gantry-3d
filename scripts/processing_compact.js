// Integrated simulator edition: export tools, no external image import.
(()=>{
  const receiveFile=loadFile;
  loadFile=async function(file,parsed){
    if(parsed?.string('x00110010')!=='GANTRY_SIMULATION')throw Error('Sólo se admiten adquisiciones recibidas desde este simulador.');
    return receiveFile(file,parsed);
  };
  const bar=document.querySelector('.application-bar');
  const menu=document.createElement('select');
  menu.id='processingFileMenu';menu.setAttribute('aria-label','Herramientas de procesamiento');
  menu.innerHTML='<option value="" disabled selected>Herramientas…</option>';
  for(const id of ['save-project']){
    const button=document.getElementById(id);
    if(button){const option=document.createElement('option');option.value=id;option.textContent=button.textContent;menu.append(option);}
  }
  const help=document.createElement('option');help.value='help';help.textContent='Cómo adquirir y procesar';menu.append(help);
  const page=document.createElement('option');page.value='flex';page.textContent='Página flexible';menu.append(page);
  menu.onchange=()=>{
    const id=menu.value;menu.value='';
    if(id==='help')status('En Adquirir, elige estática o cuerpo entero, configura los campos e inicia. Las adquisiciones del gantry aparecen automáticamente en el menú izquierdo. Puedes procesarlas y exportar la página como PNG o guardar una copia del proyecto.');
    else if(id==='flex')openFlexible();
    else document.getElementById(id)?.click();
  };
  bar.append(menu);
})();

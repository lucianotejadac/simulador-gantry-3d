  // Load only the selected study and arm pose. Keep successful assets in memory.
  function ensureActiveAtlas(){
    if(['oseo-brazos-arriba','mibi-brazos-arriba'].includes(new URLSearchParams(location.search).get('demo'))&&!window.GANTRY_DEMO_READY)return;
    const atlas=activeAtlas();
    if(atlas.ready||atlas.loading||atlas.error)return;
    let task;
    if(acquisition.study==='mag3'){
      if(!window.GANTRY_MAG3)return;
      task=window.GANTRY_MAG3.load();
    }else if(atlas.linear){
      const name=acquisition.study==='mibi'?'mibi_up':lastState?.arms==='up'?'up':'down';
      if(window.GANTRY_ICRP.poses[name]){atlas.ready=true;return;}
      task=window.GANTRY_ICRP.load(name);
    }else{
      atlas.image.decoding='async';
      task=new Promise((resolve,reject)=>{
        atlas.image.onload=resolve;
        atlas.image.onerror=()=>reject(Error('No se pudo cargar '+atlas.label));
        atlas.image.src=atlas.source;
      });
    }
    atlas.loading=true;
    task.then(()=>{atlas.ready=true;atlas.error=false;}).catch(error=>{
      atlas.error=true;console.error('Carga del estudio:',error);
    }).finally(()=>{
      atlas.loading=false;
      update(lastState||window.GANTRY.G);
    });
  }

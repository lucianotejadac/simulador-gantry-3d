/* Optional static scenery. No acquisition, geometry controls or timers changed. */
window.createSymbiaRoom = function({THREE, scene, camera, controls, renderer, floor, grid}) {
  const button=document.getElementById('roomToggle');
  const overview=document.getElementById('roomOverview');
  const status=document.getElementById('roomStatus');
  const perf=document.getElementById('roomPerformance');
  const output=document.getElementById('roomMetrics');
  const original={fog:scene.fog, floor:floor.visible, grid:grid.visible};
  let root=null, loading=null, enabled=false, metadata=null;
  let last=0, frames=0, cpu=0;

  async function load() {
    const encoded=document.getElementById('symbiaRoomData').textContent.trim();
    const bytes=Uint8Array.from(atob(encoded), c=>c.charCodeAt(0));
    const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const size=new DataView(raw).getUint32(0,true);
    const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,size)));
    if(meta.version!==1) throw new Error('Formato de sala incompatible');
    const group=new THREE.Group();
    group.name='SymbiaRoom_Static';
    group.visible=false;
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:0,side:THREE.DoubleSide});
    for(const item of meta.groups) {
      const geometry=new THREE.BufferGeometry();
      const array=(key,Type)=>new Type(raw,4+size+item[key][0],item[key][1]);
      geometry.setAttribute('position',new THREE.BufferAttribute(array('position',Float32Array),3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(array('normal',Int8Array),3,true));
      geometry.setAttribute('color',new THREE.BufferAttribute(array('color',Uint8Array),3,true));
      geometry.setIndex(new THREE.BufferAttribute(array('index',Uint32Array),1));
      geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=item.name;
      mesh.castShadow=false;
      mesh.receiveShadow=item.name==='Floor';
      mesh.matrixAutoUpdate=false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    metadata=meta;
    root=group;
    scene.add(root);
  }

  async function toggle() {
    button.disabled=true;
    try {
      if(!root) {
        status.textContent='Preparando sala…';
        if(!loading) loading=load().catch(error=>{loading=null;throw error;});
        await loading;
      }
      enabled=!enabled;
      root.visible=enabled;
      floor.visible=enabled?false:original.floor;
      grid.visible=enabled?false:original.grid;
      scene.fog=enabled?null:original.fog;
      button.textContent=enabled?'Ocultar sala':'Mostrar sala';
      button.setAttribute('aria-pressed',String(enabled));
      overview.hidden=!enabled;
      status.textContent=enabled?'SymbiaRoom · vista abierta':'';
      frames=0;cpu=0;last=performance.now();
      update();
    } catch(error) {
      status.textContent='No se pudo cargar la sala. Puedes volver a intentarlo.';
      console.error('SymbiaRoom:',error);
    } finally {button.disabled=false;}
  }

  function update() {
    if(!enabled || !root) return;
    // Cut away only the wall between an exterior camera and the scanner.
    // No ceiling: all four existing camera presets remain usable.
    for(const wall of root.children) {
      if(wall.name==='Wall_Front') wall.visible=camera.position.x>=-4.25;
      if(wall.name==='Wall_Rear') wall.visible=camera.position.x<=2.939;
      if(wall.name==='Wall_Left') wall.visible=camera.position.z>=-2.2965;
      if(wall.name==='Wall_Right') wall.visible=camera.position.z<=1.9585;
    }
  }

  function measured(start, end) {
    if(!perf.open || document.hidden) {last=0;frames=0;cpu=0;return;}
    if(!last) {last=start;return;}
    frames++;cpu+=end-start;
    if(end-last<1500) return;
    const info=renderer.info.render;
    output.textContent=(enabled?'Con sala':'Sin sala')+' · '+(1000*frames/(end-last)).toFixed(1)+' fps · '+
      (cpu/frames).toFixed(2)+' ms CPU/cuadro · '+info.calls+' llamadas · '+
      info.triangles.toLocaleString('es-CL')+' triángulos';
    output.dataset.room=String(enabled);
    output.dataset.fps=(1000*frames/(end-last)).toFixed(2);
    output.dataset.cpuMs=(cpu/frames).toFixed(3);
    output.dataset.calls=String(info.calls);
    output.dataset.triangles=String(info.triangles);
    last=end;frames=0;cpu=0;
  }

  button.addEventListener('click',toggle);
  overview.addEventListener('click',()=>{
    camera.position.set(-6.5,5.2,5.5);
    controls.target.set(-.65,.7,-.17);
    controls.update();
  });
  return {update,measured,get enabled(){return enabled;},get metadata(){return metadata;}};
};

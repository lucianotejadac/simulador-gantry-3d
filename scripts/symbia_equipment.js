/* Lightweight visual scanner. Uses the existing head transforms and table. */
window.createSymbiaEquipment = function({THREE, scene, gantry, head1, head2, simpleParts}) {
  const button=document.getElementById('equipmentToggle');
  const status=document.getElementById('equipmentStatus');
  const original=[...simpleParts,...head1.g.children.filter(c=>c!==head1.lab.spr),
    ...head2.g.children.filter(c=>c!==head2.lab.spr)].map(node=>[node,node.visible]);
  const meshes=[];
  let loading=null, metadata=null, enabled=false;

  async function load() {
    const response=await fetch(document.getElementById('symbiaEquipmentData').dataset.src);
    if(!response.ok) throw Error('Equipo no disponible ('+response.status+')');
    const raw=await new Response(new Blob([await response.arrayBuffer()]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const size=new DataView(raw).getUint32(0,true);
    const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,size)));
    if(meta.version!==1 || meta.groups.length!==3) throw Error('Formato de equipo incompatible');
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.05,side:THREE.DoubleSide});
    const pending=[];
    try {
      for(const item of meta.groups) {
        if(!['Gantry','Detector1','Detector2'].includes(item.name)) throw Error('Componente desconocido');
        const geometry=new THREE.BufferGeometry();
        const array=(key,Type)=>new Type(raw,4+size+item[key][0],item[key][1]);
        geometry.setAttribute('position',new THREE.BufferAttribute(array('position',Float32Array),3));
        geometry.setAttribute('normal',new THREE.BufferAttribute(array('normal',Int8Array),3,true));
        geometry.setAttribute('color',new THREE.BufferAttribute(array('color',Uint8Array),3,true));
        geometry.setIndex(new THREE.BufferAttribute(array('index',Uint32Array),1));
        geometry.computeBoundingSphere();
        const mesh=new THREE.Mesh(geometry,material);
        mesh.name='Symbia_'+item.name; mesh.visible=false;
        mesh.castShadow=false;mesh.receiveShadow=false;
        mesh.matrixAutoUpdate=false;mesh.updateMatrix();
        pending.push([item.name,mesh]);
      }
    } catch(error) {
      pending.forEach(([,m])=>m.geometry.dispose());material.dispose();throw error;
    }
    for(const [name,mesh] of pending) {
      (name==='Gantry'?scene:name==='Detector1'?head1.g:head2.g).add(mesh);
      meshes.push(mesh);
    }
    metadata=meta;
  }

  async function setEnabled(value) {
    if(button.disabled) return;
    button.disabled=true;
    try {
      if(value && !metadata) {
        status.textContent='Cargando equipo Symbia…';
        if(!loading) loading=load().catch(error=>{loading=null;throw error;});
        await loading;
      }
      enabled=value;
      meshes.forEach(m=>{m.visible=enabled;});
      original.forEach(([node,visible])=>{node.visible=enabled?false:visible;});
      // Labels remain readable above the thicker original detector housing.
      for(const h of [head1,head2]) h.lab.spr.position.y=enabled?.46:.37;
      button.textContent=enabled?'Usar equipo simple':'Usar equipo Symbia';
      button.setAttribute('aria-pressed',String(enabled));
      status.textContent=enabled?'Symbia · modelo visual':'Equipo simple';
    } catch(error) {
      status.textContent='No se pudo cargar Symbia. Se mantiene el equipo simple; puedes reintentar.';
      console.error('Symbia:',error);
    } finally {button.disabled=false;}
  }
  button.addEventListener('click',()=>setEnabled(!enabled));
  // Nonblocking: acquisition and the simple scanner are available while loading.
  const ready=setEnabled(new URLSearchParams(location.search).get('equipo')!=='simple');
  return {ready,setEnabled,get enabled(){return enabled;},get metadata(){return metadata;}};
};

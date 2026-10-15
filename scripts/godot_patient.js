  // Both fixed Godot poses share textures and one download. Coordinates are
  // baked into the same local patient frame as the detector collision model.
  let patientLoadState='loading';
  const patientPoses={};
  new GLTFLoader().load(PATIENT_GLB, gltf=>{
    const model=gltf.scene;
    for(const pose of ['down','up']){
      patientPoses[pose]=model.getObjectByName(PATIENT_DATA.poses[pose].node);
      if(!patientPoses[pose]){
        patientLoadState='error';
        console.error('Falta la postura del paciente: '+pose);return;
      }
    }
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    flip.add(model);flip.remove(dummy);patientVisual=model;
    setArms(st.arms==='up');
    collision.invalidate();
    if(window.GANTRY?.fit){if(!window.GANTRY.fit())apply(null);}else apply(null);
    patientLoadState='ready';
  },undefined,error=>{
    patientLoadState='error';console.error('No se pudo cargar el paciente de Godot.',error);
  });

  function setArms(up){
    // Keep the fallback functional while the initial modal blocks loading.
    const upperAngle=Math.atan2(.60,-.80),lowerAngle=Math.atan2(-.60,-.80);
    dummyArms.forEach(a=>{
      a.g.rotation.y=up?-upperAngle*a.s:0;
      a.elbow.rotation.y=up?(upperAngle-lowerAngle)*a.s:0;
    });
    if(!patientPoses.down||!patientPoses.up)return;
    patientPoses.down.visible=!up;patientPoses.up.visible=up;
    bodyH=PATIENT_DATA.poses[up?'up':'down'].height;
  }

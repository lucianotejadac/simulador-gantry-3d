  // Relax both feet outwards around the patient's longitudinal axis. The
  // existing skin weights blend the rotation into the ankle; collision uses
  // these same posed vertices, including when the patient's entry is reversed.
  function relaxPatientFeet(model){
    scene.updateMatrixWorld(true);
    const axis=new THREE.Vector3(1,0,0).transformDirection(flip.matrixWorld);
    const feet=[];
    model.traverse(bone=>{
      if(!bone.isBone||!/^foot[lr]$/i.test((bone.name||'').replace(/[^a-z]/gi,'')))return;
      const pivot=flip.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const side=Math.sign(pivot.z)||1;
      const world=bone.getWorldQuaternion(new THREE.Quaternion());
      const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const turn=new THREE.Quaternion().setFromAxisAngle(axis,side*35*Math.PI/180);
      bone.quaternion.copy(parent.invert().multiply(turn).multiply(world));
      bone.updateMatrixWorld(true);
      const tip=bone.children.find(child=>child.position.length()>0);
      const direction=tip?flip.worldToLocal(tip.getWorldPosition(new THREE.Vector3())).sub(pivot).normalize().toArray():null;
      feet.push({bone:bone.name,side,rotationDegrees:side*35,direction});
    });
    window.GANTRY_FOOT_POSE={model:'supine-external-feet-v1',feet};
  }

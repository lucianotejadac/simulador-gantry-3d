/* Visual accessory attached to the posed wrist, outside the collision/radiotracer model. */
window.createGantryWristband=function({THREE,scene,flip,camera,canvas,getArm}){
  const group=new THREE.Group();group.name='Patient identification wristband';flip.add(group);
  const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.65,side:THREE.DoubleSide});
  const edge=new THREE.MeshStandardMaterial({color:0x32c5de,roughness:.5});
  const strap=new THREE.Mesh(new THREE.CylinderGeometry(.029,.032,.037,32,1,true),white);group.add(strap);
  for(const y of [-.0185,.0185]){const ring=new THREE.Mesh(new THREE.TorusGeometry(y<0?.032:.029,.0015,6,32),edge);ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring);}
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=256;
  const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
  const plate=new THREE.Mesh(new THREE.BoxGeometry(.059,.036,.004),white);plate.position.z=.030;group.add(plate);
  const label=new THREE.Mesh(new THREE.PlaneGeometry(.056,.033),new THREE.MeshBasicMaterial({map:texture}));label.position.z=.0322;group.add(label);
  let identityKey='',down=null;
  const yAxis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function update(){
    scene.updateMatrixWorld(true);const arm=getArm();if(!arm){group.visible=false;return;}
    const elbow=flip.worldToLocal(arm.elbow.clone()),wrist=flip.worldToLocal(arm.wrist.clone());
    group.visible=true;direction.subVectors(wrist,elbow).normalize();group.position.copy(wrist).addScaledVector(direction,-.022);group.quaternion.setFromUnitVectors(yAxis,direction);group.updateMatrixWorld(true);
    const identity=window.GANTRY_PATIENT_RECORDS?.identity();if(!identity)return;
    const key=identity.fullName+identity.rut;if(key===identityKey)return;identityKey=key;
    const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,256);ctx.fillStyle='#17768a';ctx.fillRect(0,0,512,36);ctx.fillStyle='#fff';ctx.font='bold 23px Arial';ctx.fillText('IDENTIFICACIÓN · SIMULADO',12,26);
    ctx.fillStyle='#101820';ctx.font='bold 27px Arial';const words=identity.fullName.split(' ');ctx.fillText(words.slice(0,2).join(' ').toUpperCase(),16,80,480);ctx.fillText(words.slice(2).join(' ').toUpperCase(),16,118,480);ctx.font='bold 34px Arial';ctx.fillText(identity.rut,16,170);
    for(let x=16;x<380;x+=7)ctx.fillRect(x,195,x%3+2,35);texture.needsUpdate=true;
  }
  function pick(event){
    if(!group.visible)return false;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return false;
    for(let parent=group.parent;parent;parent=parent.parent)if(!parent.visible)return false;
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);
    const hit=ray.intersectObject(group,true)[0];if(!hit)return false;
    // Respect occlusion by the detector, bed, patient and room.
    const blockers=ray.intersectObjects(scene.children,true).filter(h=>{
      if(h.distance>=hit.distance-0.001||!h.object.isMesh)return false;
      for(let node=h.object;node;node=node.parent)if(!node.visible||node===group)return false;
      const material=h.object.material;return !Array.isArray(material)&&material?.visible!==false&&!(material?.transparent&&material.opacity<.25);
    });return blockers.length===0;
  }
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!pick(event))return;down={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();},true);
  canvas.addEventListener('pointermove',event=>{canvas.style.cursor=down||pick(event)?'pointer':'';});
  canvas.addEventListener('pointerup',event=>{if(!down||down.id!==event.pointerId)return;const start=down;down=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<=6&&pick(event))window.GANTRY_PATIENT_RECORDS?.open('band');event.stopImmediatePropagation();},true);
  canvas.addEventListener('pointercancel',()=>{down=null;canvas.style.cursor='';});
  function placement(){update();const arm=getArm(),world=group.getWorldPosition(new THREE.Vector3()),labelWorld=label.getWorldPosition(new THREE.Vector3()),screen=labelWorld.clone().project(camera),r=canvas.getBoundingClientRect();return {world:world.toArray(),wrist:arm?.wrist.toArray(),visible:group.visible,labelWorld:labelWorld.toArray(),screen:[r.left+(screen.x+1)*r.width/2,r.top+(1-screen.y)*r.height/2],identity:identityKey};}
  return {update,placement};
};

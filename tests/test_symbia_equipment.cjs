const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {gunzipSync}=require('node:zlib');
const manifest=JSON.parse(fs.readFileSync('assets/symbia-equipment/manifest.json'));
const packed=fs.readFileSync(manifest.url),raw=gunzipSync(packed),size=raw.readUInt32LE(0);
const meta=JSON.parse(raw.subarray(4,4+size));
assert(packed.length<350000);assert.equal(meta.scale,1);
assert.deepEqual(meta.groups.map(g=>g.name),['Gantry','Detector1','Detector2']);
assert(meta.components.every(c=>!/^Pallet|^Table_|Handle|Patient|Wall|Floor/.test(c.name)));
assert(meta.components.some(c=>c.name==='SPECT_Rotation_Part_21'));
assert(meta.components.some(c=>c.name==='SPECT_Rotation_Part_22'));
for(const g of meta.groups){
  const pos=new Float32Array(raw.buffer,raw.byteOffset+4+size+g.position[0],g.position[1]);
  const idx=new Uint32Array(raw.buffer,raw.byteOffset+4+size+g.index[0],g.index[1]);
  assert(pos.every(Number.isFinite));assert(idx.every(i=>i<g.vertices));
  assert.equal(idx.length,g.triangles*3);
  if(g.name!=='Gantry'){
    // The complete housing stays behind the collimator's innermost rail.
    assert(g.bounds[0][1]>-.0001);
    assert(g.bounds[0][1]<.0001);
    assert(g.bounds[0][0]<0 && g.bounds[1][0]>0,'Detector straddles acquisition plane');
    assert(g.bounds[1][2]-g.bounds[0][2]>.75,'Original housing width retained');
  }
}
class Group{constructor(){this.children=[];this.visible=true;}add(m){this.children.push(m);m.parent=this;}}
class Geometry{setAttribute(){}setIndex(){}computeBoundingSphere(){}dispose(){}}
class Mesh{constructor(g,m){this.geometry=g;this.material=m;this.visible=true;}updateMatrix(){}}
class Attribute{constructor(array){this.array=array;}}
const THREE={Group,Mesh,BufferGeometry:Geometry,BufferAttribute:Attribute,MeshStandardMaterial:class{dispose(){}},DoubleSide:2};
function harness(fail=false,query=''){
  const elements={},scene=new Group(),simple=new Group(),heads=[1,2].map(()=>{
    const g=new Group(),body=new Group(),spr={position:{y:.37},visible:true};g.add(body);g.add(spr);
    return {g,lab:{spr},body};
  });
  for(const id of ['equipmentToggle','equipmentStatus','symbiaEquipmentData'])elements[id]={dataset:{src:manifest.url},addEventListener(t,fn){this[t]=fn;},setAttribute(k,v){this[k]=v;}};
  const h={fail,downloads:0,elements,scene,simple,heads};
  const ctx={window:{},document:{getElementById:id=>elements[id]},location:{search:query},URLSearchParams,
    console:{error(){}},fetch:async()=>{h.downloads++;return new Response(h.fail?'':packed,{status:h.fail?503:200});},
    Blob,Response,DecompressionStream,DataView,TextDecoder,Uint8Array,Int8Array,Float32Array,Uint32Array};
  vm.runInNewContext(fs.readFileSync('scripts/symbia_equipment.js','utf8'),ctx);
  h.api=ctx.window.createSymbiaEquipment({THREE,scene,gantry:new Group(),head1:heads[0],head2:heads[1],simpleParts:[simple]});
  return h;
}
(async()=>{
  const h=harness();assert(h.simple.visible);assert.equal(h.scene.children.length,0);
  await h.api.ready;assert(h.api.enabled);assert(!h.simple.visible);
  assert.equal(h.scene.children.length,1);assert.equal(h.downloads,1);
  for(const head of h.heads){
    assert(head.lab.spr.visible);assert(!head.body.visible);
    assert.equal(head.g.children.length,3);
    assert.equal(head.g.children[2].parent,head.g,'Imported detector inherits current rotation/radial placement');
    assert.equal(head.g.children[2].castShadow,false);
  }
  await h.api.setEnabled(false);assert(h.simple.visible);assert(!h.scene.children[0].visible);
  assert(h.heads.every(head=>head.body.visible && head.lab.spr.position.y===.37));
  await h.api.setEnabled(true);assert.equal(h.downloads,1);assert.equal(h.scene.children.length,1);
  const failure=harness(true);await failure.api.ready;
  assert(!failure.api.enabled);assert(failure.simple.visible);assert.equal(failure.scene.children.length,0);
  failure.fail=false;await failure.api.setEnabled(true);assert(failure.api.enabled);assert.equal(failure.downloads,2);
  const simple=harness(false,'?equipo=simple');await simple.api.ready;assert.equal(simple.downloads,0);
  const html=fs.readFileSync('index.html','utf8');assert(html.includes(fs.readFileSync('scripts/symbia_equipment.js','utf8')));
  assert(html.includes('data-src="'+manifest.url+'"'));
  console.log('OK: packed source geometry, rigid detector registration, 3 batches, external asynchronous load, existing motion parents, reversible visibility, single download, error fallback/retry, simple startup.');
})().catch(e=>{console.error(e);process.exitCode=1;});

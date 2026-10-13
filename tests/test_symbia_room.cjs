// Real packed asset and loader, small Three/DOM substitutes (no browser required).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {gunzipSync}=require('node:zlib');
const {performance}=require('node:perf_hooks');
const asset=fs.readFileSync('assets/symbia-room/room.bin.gz');
const raw=gunzipSync(asset),size=raw.readUInt32LE();
const manifest=JSON.parse(raw.subarray(4,4+size));
assert.equal(manifest.groups.length,6);
assert(asset.length<700000);
const floor=manifest.groups.find(g=>g.name==='Floor');
assert(Math.abs(floor.bounds[1][0]-floor.bounds[0][0]-7.189)<1e-5);
assert(Math.abs(floor.bounds[1][2]-floor.bounds[0][2]-4.255)<1e-5);
for(const g of manifest.groups){
  const idx=new Uint32Array(raw.buffer,raw.byteOffset+4+size+g.index[0],g.index[1]);
  assert(idx.every(i=>i<g.vertices));
}
class Group {constructor(){this.children=[];this.visible=true;}add(v){this.children.push(v);}}
class Geometry {setAttribute(){}setIndex(){}computeBoundingSphere(){}}
class Mesh {constructor(g,m){this.geometry=g;this.material=m;this.visible=true;}updateMatrix(){}}
class Attribute {constructor(array){this.array=array;}}
const elements={};
for(const id of ['roomToggle','roomOverview','roomStatus','roomPerformance','roomMetrics','symbiaRoomData']){
  elements[id]={textContent:'',dataset:{},addEventListener(type,cb){this[type]=cb;},setAttribute(k,v){this[k]=v;}};
}
elements.symbiaRoomData.textContent=asset.toString('base64');
const scene=new Group();scene.fog={original:true};
const fog=scene.fog,plainFloor={visible:true},grid={visible:true};
const camera={position:{x:-3.4,y:2.3,z:3.7,set(){}}};
const context={window:{},document:{getElementById:id=>elements[id]},performance,console,atob,Uint8Array,Int8Array,Float32Array,Uint32Array,DataView,TextDecoder,Blob,Response,DecompressionStream};
vm.runInNewContext(fs.readFileSync('scripts/symbia_room.js','utf8'),context);
const room=context.window.createSymbiaRoom({THREE:{Group,BufferGeometry:Geometry,BufferAttribute:Attribute,Mesh,MeshStandardMaterial:class{},DoubleSide:2},scene,camera,controls:{update(){},target:{set(){}}},renderer:{info:{render:{}}},floor:plainFloor,grid});
(async()=>{
  assert.equal(room.metadata,null);assert.equal(scene.children.length,0);
  await elements.roomToggle.click();
  assert.equal(room.enabled,true);assert.equal(scene.children.length,1);
  assert.equal(plainFloor.visible,false);assert.equal(scene.fog,null);
  const root=scene.children[0];
  assert.equal(root.children.find(m=>m.name==='Wall_Right').visible,false);
  camera.position.z=0;room.update();
  assert.equal(root.children.find(m=>m.name==='Wall_Right').visible,true);
  assert(root.children.every(m=>m.castShadow===false));
  await elements.roomToggle.click();
  assert.equal(room.enabled,false);assert.equal(root.visible,false);
  assert.equal(plainFloor.visible,true);assert.equal(grid.visible,true);assert.equal(scene.fog,fog);
  await elements.roomToggle.click();assert.equal(scene.children.length,1);
  const html=fs.readFileSync('index.html','utf8');
  assert(html.includes(fs.readFileSync('scripts/symbia_room.js','utf8')));
  assert(html.includes(asset.toString('base64')));
  console.log('OK: lazy decoding, real asset bounds/indices, six batches, cutaway walls, no shadow casters, hide/restore/reuse, offline embedding.');
})().catch(e=>{console.error(e);process.exitCode=1;});

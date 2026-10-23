const fs=require('node:fs'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {fixture}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),M=W.GANTRY_MDP,meta=JSON.parse(fs.readFileSync('assets/icrp145/mdp-provenance.json','utf8')),
   html=fs.readFileSync('index.html','utf8'),mag=JSON.parse(html.match(/window.GANTRY_MAG3_DATA=(.*?);\n/)[1]);
 assert.equal(M.metadata().vascularAppearance.arterialTransitSeconds,9);
 assert.equal(M.metadata().vascularPhantom,'icrp-continuous-lower-perfusion-v3');
 // Native leg territories must survive quantization and projection in both poses.
 for(const name of ['up','down']){
  const payload=meta.poses[name].organs,b=zlib.inflateSync(fs.readFileSync(payload.url)),a=new Uint16Array(b.buffer,b.byteOffset,b.byteLength/2),
    source=zlib.inflateSync(fs.readFileSync(mag.urls[name])),src=new Uint16Array(source.buffer,source.byteOffset,source.byteLength/2),size=36*384*160;
  let missingLegMass=0;
  for(let i=0;i<size;i++){
   const actual=a[6*size+i]*payload.scales[6];
   assert(Number.isFinite(actual)&&actual>=0);
   if(src[12*size+i]===0&&src[13*size+i]===0&&src[14*size+i]>100)missingLegMass+=actual;
  }
  assert(missingLegMass>0,'Leg arteries missing from MDP phantom');
  await M.load(name);
  const p=M.geometry(name),metrics=W.metrics(15,'bone','LEHR',140,15);
  for(const angle of [0,45,90,135,180,270]){
   await M.ensureAngles(name,[angle]);
   const cache={},field=M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},{x:0,y:0,w:p.width,h:p.height},128,320,false,false,metrics,1,name,cache,15);
   assert(field.values.every(x=>Number.isFinite(x)&&x>=0));assert(field.sum>0);
   assert(cache.bases[7].slice(220*128,270*128).some(x=>x>1e-8),'Distal arterial field must have actual counts');
   assert.deepEqual(M.mix(field.mdpBases,30).values,M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},{x:0,y:0,w:p.width,h:p.height},128,320,false,false,metrics,1,name,cache,30).values,'Live and acquisition use identical kinetics');
  }
 }
 // Changing spatial transit does not alter blood clearance or total activity.
 for(let s=0;s<=10800;s+=.5){
  const f=M.fractions(s),t=s/60,expectedBlood=(.78*Math.exp(-t/2)+.14*Math.exp(-t/45)+.08*Math.exp(-t/180))*f.decay;
  assert(Math.abs(f.blood-expectedBlood)<1e-12);assert(f.weights.every(x=>x>=0));
  assert(Math.abs(f.weights.reduce((sum,x)=>sum+x,0)+f.excreted-f.decay)<1e-12);
 }
 assert.equal(M.fractions(7200).weights[7],0);
 const copy=M.metadata();copy.vascularAppearance.arterialTransitSeconds=999;assert.equal(M.metadata().vascularAppearance.arterialTransitSeconds,9);
 console.log('OK: leg perfusion, six angular projections, both poses, shared temporal integration, immutable metadata and unchanged systemic activity balance.');
})().catch(e=>{console.error(e);process.exitCode=1;});

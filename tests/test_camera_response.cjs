const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const window={GANTRY_CAMERA_DATA:JSON.parse(fs.readFileSync('assets/physics/siemens-recovered-equipment.json','utf8'))};
const env=vm.createContext({window,Math,Float32Array,Float64Array,Uint32Array,Int32Array});
for(const file of ['camera_response','icrp_live'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),env);
const C=window.GANTRY_CAMERA,I=window.GANTRY_ICRP;
assert(Math.abs(C.response(10,'LEHR').systemFwhmMm-7.5)<1e-9);
assert(C.response(0,'LEHR').systemFwhmMm>=3.8);
assert(C.response(30,'LEHR').systemFwhmMm>C.response(10,'LEHR').systemFwhmMm);
assert(C.response(10,'MELP').systemFwhmMm>C.response(10,'LEHR').systemFwhmMm);
assert(C.response(10,'HE').systemFwhmMm>C.response(10,'MELP').systemFwhmMm);
assert.equal(C.response(10,'NONE'),null);
assert(C.response(10,'LEHR','high').systemFwhmMm>C.response(10,'LEHR').systemFwhmMm);
assert(C.response(10,'LEHR','low',2).systemFwhmMm>C.response(10,'LEHR').systemFwhmMm);
// A narrow, finely sampled source measures the rendering operator, not atlas anatomy.
const side=1120,mm=.5,frame=new Float32Array(side*side);
for(let y=0;y<side;y++)for(let x=0;x<side;x++)frame[y*side+x]=Math.exp(-(((x+.5-side/2)*mm)**2+((y+.5-side/2)*mm)**2)/2);
const pose={width:side,height:side,pixelMm:mm,frames:[frame],scale:1,window:1};
const pair={lo:0,hi:0,mix:0};
function measure(n,zoom=1,distance=10,col='LEHR'){
 const size=side/zoom,crop={x:(side-size)/2,y:(side-size)/2,w:size,h:size};
 const m={...C.response(distance,col),contrast:1,countFactor:1,haloAlpha:0,haloBlur:0};
 const f=I.field(pose,pair,crop,n,n,false,false,m,999); // legacy pixel sigma must be ignored
 const pixel=mm*size/n;let xx=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)xx+=f.values[y*n+x]*((x+.5-n/2)*pixel)**2;
 return {fwhm:Math.sqrt(xx/f.sum)*C.FWHM_SIGMA,sum:f.sum,pixel};
}
const baseline=measure(256);
for(const n of [256,512,1024]){
 const r=measure(n),zoom=measure(n,2);
 assert(Math.abs(r.fwhm/baseline.fwhm-1)<.08,'Physical response should not sharpen as matrix increases');
 assert(Math.abs(zoom.fwhm/r.fwhm-1)<.10,'Zoom must keep physical blur');
 assert(Math.abs(r.sum/baseline.sum-1)<1e-6,'Matrix cannot alter detected rate');
 assert.equal(r.pixel,560/n);
 assert(measure(n,1,30).fwhm>r.fwhm*1.7);
 assert(measure(n,1,10,'HE').fwhm>r.fwhm*1.5);
 console.log(n+' pixels: FWHM '+r.fwhm.toFixed(2)+' mm; zoom 2 '+zoom.fwhm.toFixed(2)+' mm; pixel '+r.pixel.toFixed(3)+' mm');
}
// Non-square output still uses physical X/Y pitch independently.
const sampling=C.sampling(pose,{w:100,h:300},100,150,C.response(10,'LEHR'));
assert.equal(sampling.pixelXmm,.5);assert.equal(sampling.pixelYmm,1);
assert.equal(sampling.sigmaX,2*sampling.sigmaY);
console.log('OK: recovered nominal parameters, physical PSF, distance, collimator, zoom and conserved high-matrix rate.');
// Production MDP atlas plus the actual energy/collimator electronics.
(async()=>{
 const {fixture,project}=require('./bone_performance_fixture.cjs'),W=await fixture();
 for(const col of ['LEHR','MELP','HE']){
  let reference;
  for(const n of [256,512,1024]){
   const f=project(W,{col,n,distance:10});reference??=f.sum;
   assert(Math.abs(f.sum/reference-1)<1e-6,'Physical camera must conserve total rate across matrices');
   assert(f.values.every(Number.isFinite));
  }
 }
 console.log('OK: production bone atlas, all collimators, matrices 256/512/1024.');
})().catch(e=>{console.error(e);process.exitCode=1});

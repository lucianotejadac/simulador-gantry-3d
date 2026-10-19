const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,project}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),C=W.GANTRY_CAMERA,M=W.GANTRY_MDP;
 for(const col of ['LEHR','MELP','HE']){
  const surface=C.response(2,col),depth=C.withDepth(surface,60,3600),trueDistance=C.response(8,col);
  assert(Math.abs(depth.systemFwhmMm-trueDistance.systemFwhmMm)<1e-10,'one-depth source uses skin gap plus depth');
  assert(C.withDepth(surface,60,6000).systemFwhmMm>depth.systemFwhmMm,'depth spread affects PSF variance');
  assert.equal(C.withDepth(surface,0,0).systemFwhmMm,surface.systemFwhmMm);
 }
 let reference;
 for(const n of [128,256,512,1024]){
  const f=project(W,{n,distance:2,move:-65}),r=f.projectionResponse;
  assert(r.sourceDepthMeanMm>10&&r.sourceDepthMeanMm<180);
  assert(r.sourceDepthRmsMm>=r.sourceDepthMeanMm);
  assert(r.systemFwhmMm>C.response(2,'LEHR').systemFwhmMm);
  reference??=r.systemFwhmMm;assert.equal(r.systemFwhmMm,reference,'matrix does not change detector physics');
  assert(f.values.every(v=>v>=0&&Number.isFinite(v)));
 }
 const head=project(W,{move:-100}).projectionResponse,legs=project(W,{move:250}).projectionResponse;
 assert(Math.abs(head.sourceDepthMeanMm-legs.sourceDepthMeanMm)>1,'depth depends on actual ROI');
 await M.ensureAngles('up',[359,0]);
 const f0=project(W,{angle:0}),f360=project(W,{angle:360});
 assert.equal(f0.projectionResponse.sourceDepthMeanMm,f360.projectionResponse.sourceDepthMeanMm);
 const uncollimated=project(W,{col:'NONE',n:128});assert(!uncollimated.projectionResponse.sourceDepthMeanMm);
 if(process.env.BONE_DEPTH_COMPARISON){
  const previous=fs.readFileSync('scripts/mdp.js','utf8').replace('const d=source.depth;','return metrics; const d=source.depth;');
  const old=await fixture({mdp:previous});const path=require('node:path');
  fs.mkdirSync(process.env.BONE_DEPTH_COMPARISON,{recursive:true});
  for(const [name,engine] of [['before',old],['after',W]])for(const n of [128,256]){
   const f=project(engine,{n,distance:2,move:-65});
   fs.writeFileSync(path.join(process.env.BONE_DEPTH_COMPARISON,name+'-'+n+'.f32'),Buffer.from(f.values.buffer));
   console.log(name,n,'FWHM',f.projectionResponse.systemFwhmMm.toFixed(2),'depth',f.projectionResponse.sourceDepthMeanMm?.toFixed(2));
  }
 }
 console.log('OK: phantom-derived ROI depth, PSF moments, matrix independence, angular closure, no-collimator bypass.');
})().catch(e=>{console.error(e);process.exitCode=1;});

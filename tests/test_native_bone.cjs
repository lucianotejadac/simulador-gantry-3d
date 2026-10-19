const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,project}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),M=W.GANTRY_MDP;
 const loaded=await M.load('up');assert(loaded[0].nativeSampling);assert.equal(loaded[0].pixelMm,3);
 const low=project(W,{n:256,distance:2}),high=project(W,{n:1024,distance:2});
 assert(Math.abs(low.sum/high.sum-1)<1e-6);
 assert(high.values.every(v=>v>=0&&Number.isFinite(v)));
 for(let i=1;i<high.cdf.length;i++)assert(high.cdf[i]>=high.cdf[i-1]);
 // Measure the native filtering path against its specified physical variance.
 const I=W.GANTRY_ICRP,C=W.GANTRY_CAMERA,side=560,frame=new Float32Array(side*side);
 for(let y=0;y<side;y++)for(let x=0;x<side;x++)frame[y*side+x]=Math.exp(-((x+.5-side/2)**2+(y+.5-side/2)**2)/2);
 const pose={width:side,height:side,pixelMm:1,frames:[frame],scale:1,window:1,nativeSampling:true};
 for(const n of [256,512,1024]){
  const response=C.response(10,'LEHR'),f=I.field(pose,{lo:0,hi:0,mix:0},{x:0,y:0,w:side,h:side},n,n,false,false,{...response,contrast:1,countFactor:1,haloAlpha:0,haloBlur:0},0);
  let moment=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++)moment+=f.values[y*n+x]*((x+.5-n/2)*side/n)**2;
  const measured=Math.sqrt(moment/f.sum)*C.FWHM_SIGMA;
  assert(Math.abs(measured/Math.hypot(7.5,C.FWHM_SIGMA)-1)<.09,'native PSF variance');
  if(n>=512){
   // A Gaussian source convolved with the nominal Gaussian has an analytic
   // half-height width. The old box approximation passed the loose variance
   // check but produced a wider, non-Gaussian peak at high matrices.
   const profile=new Float64Array(n);
   for(let y=0;y<n;y++)for(let x=0;x<n;x++)profile[x]+=f.values[y*n+x];
   const peak=Math.max(...profile),half=peak/2;let left=profile.indexOf(peak),right=left;
   while(left>0&&profile[left]>=half)left--;
   while(right<n-1&&profile[right]>=half)right++;
   const l=left+(half-profile[left])/(profile[left+1]-profile[left]);
   const r=right-1+(profile[right-1]-half)/(profile[right-1]-profile[right]);
   const width=(r-l)*side/n,analytic=Math.hypot(7.5,C.FWHM_SIGMA);
   assert(Math.abs(width/analytic-1)<.04,'native high-matrix peak must retain Gaussian shape');
  }
 }
 // Isolate direct high-matrix sampling from enlargement of the same 256 source.
 const bp=loaded[0],crop={x:60,y:200,w:186,h:186},metrics={...C.response(2,'LEHR'),contrast:1,countFactor:1,haloAlpha:0,haloBlur:0};
 const native=I.field(bp,{lo:0,hi:0,mix:0},crop,1024,1024,false,false,metrics,0);
 const enlarged=I.field({...bp,nativeSampling:false},{lo:0,hi:0,mix:0},crop,1024,1024,false,false,metrics,0);
 const difference=native.values.reduce((s,v,i)=>s+Math.abs(v-enlarged.values[i]),0)/native.sum;
 assert(difference>.001,'native high matrix must not simply enlarge 256 pixels');
 await Promise.all([M.ensureAngles('up',[70,250]),M.ensureAngles('up',[70,250])]);
 assert(M.hasAngles('up',[70,250]));assert(M.hasAngles('up',[0,180]));
 if(process.env.BONE_COMPARISON){
  const script=fs.readFileSync('scripts/mdp.js','utf8').replace("const wrap=a=>", "for(const p of Object.values(data.poses))delete p.nativeBone; const wrap=a=>");
  const old=await fixture({mdp:script});
  const path=require('node:path');fs.mkdirSync(process.env.BONE_COMPARISON,{recursive:true});
  for(const [name,engine] of [['before',old],['after',W]])for(const n of [256,512,1024]){
   const f=project(engine,{n,distance:2,move:-65});
   fs.writeFileSync(path.join(process.env.BONE_COMPARISON,name+'-'+n+'.f32'),Buffer.from(f.values.buffer));
  }
 }
 console.log('OK: native 3 mm bones, independent high matrix, physical PSF, nonnegative conserved counts, angle prefetch. Difference from enlargement: '+(difference*100).toFixed(2)+'%');
})().catch(e=>{console.error(e);process.exitCode=1;});

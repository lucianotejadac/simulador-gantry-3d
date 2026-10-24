// Time integration and anonymous temporal-reference regression, no patient data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const W={GANTRY_MDP_DATA:{poses:{up:{}}}},ctx=vm.createContext({window:W,document:{getElementById:()=>null}});
vm.runInContext(fs.readFileSync('scripts/mdp.js','utf8'),ctx);
const M=W.GANTRY_MDP,ref=JSON.parse(fs.readFileSync('assets/physics/mdp-temporal-calibration.json','utf8'));
function prediction(old=false){
 const ratios=ref.seconds.map(s=>{
  const f=M.fractions(s),w=Array.from(f.weights);
  if(old){const central=Math.exp(-s/6),lungs=(1-central)*Math.exp(-s/12),arterial=f.blood*(1-central-lungs)*Math.exp(-s/9);w[1]+=w[7]-arterial;w[7]=arterial;}
  const signals=[0,1].map(j=>w.reduce((sum,v,c)=>sum+v*ref.syntheticRoiMeans[c][j],0));return signals[0]/Math.max(signals[1],1e-15);
 });const peak=Math.max(...ratios.slice(0,40))-1;
 return ratios.map(v=>Math.max(v-1,0)/peak);
}
const before=prediction(true),after=prediction();
for(const target of [ref.fitMedianRelativeExcess,ref.reservedMedianRelativeExcess]){
 const error=p=>Math.sqrt(p.slice(20).reduce((sum,v,i)=>sum+(v-target[i+20])**2,0)/101);
 assert(error(after)<error(before)*.8,'Residual improves unshifted contrast on both aggregate groups');
}
for(let s=0;s<=10800;s+=.5){
 const f=M.fractions(s),t=s/60,c=Math.exp(-s/6),l=(1-c)*Math.exp(-s/12),oldArterial=(1-c-l)*Math.exp(-s/9)*f.blood*f.vascularContrast;
 assert(f.weights.every(v=>Number.isFinite(v)&&v>=0));
 assert(Math.abs(f.weights.reduce((a,b)=>a+b,0)+f.excreted-f.decay)<1e-12);
 if(s<=10||s>=600)assert(Math.abs(f.weights[7]-oldArterial)<1e-14,'Early first pass and later pool/bone remain unchanged');
 const expected=(.78*Math.exp(-t/2)+.14*Math.exp(-t/45)+.08*Math.exp(-t/180))*f.decay;
 assert(Math.abs(f.blood-expected)<1e-12,'No additional systemic activity');
}
const bases=Array.from({length:8},(_,c)=>Float32Array.from({length:8},(_,i)=>Number(i===c)));
function integrate(start,duration,chunks,dynamic=false){
 M.configure(1,start);const integrals=new Float64Array(8),steps=[];
 const session={mode:'time',target:duration,heads:[{elapsed:0},{elapsed:0}],finished:false,
  step(fields,rate,dt){
   const elapsed=this.heads[0].elapsed;
   if(this.dynamic)assert(elapsed+dt<=this.dynamic.schedule[this.dynamic.frames.length].end+1e-7,'Never cross a dynamic frame boundary');
   steps.push([M.seconds,dt]);for(let c=0;c<8;c++)integrals[c]+=fields[0].values[c]/2000000*dt;
   this.heads.forEach(h=>h.elapsed+=dt);this.finished=this.heads[0].elapsed>=duration-1e-8;
   if(this.dynamic&&this.heads[0].elapsed>=this.dynamic.schedule[this.dynamic.frames.length].end-1e-8)this.dynamic.frames.push({});
  }};
 if(dynamic)session.dynamic={frames:[],schedule:Array.from({length:120},(_,i)=>({end:(i+1)*1.002}))};
 const field=M.mix(bases,start);
 for(let at=0;!session.finished&&at<100000;at++)M.step(session,[field,field],chunks);
 assert(session.finished);assert(Math.abs(M.seconds-start-duration)<1e-7);
 if(dynamic)assert.equal(session.dynamic.frames.length,120);
 assert(steps.every(([s,dt])=>s>=start-1e-8&&s+dt<=start+duration+1e-7),'All samples remain in the actual acquisition interval');
 return integrals;
}
function numerical(start,duration){
 const sums=new Float64Array(8),n=Math.ceil(duration/.01),dt=duration/n;
 for(let i=0;i<n;i++){const f=M.fractions(start+(i+.5)*dt);for(let c=0;c<8;c++)sums[c]+=f.weights[c]*dt;}
 return sums;
}
for(const [start,duration,dynamic] of [[0,120.24,true],[128.228,84.927,false],[163.994,239.169,false],[407.902,155.718,false],[7199.3,3,false]]){
 const expected=numerical(start,duration),instant=integrate(start,duration,1000,dynamic),realtime=integrate(start,duration,.2,dynamic);
 for(let c=0;c<8;c++){
  const tolerance=.003*Math.max(expected[c],.1);
  assert(Math.abs(instant[c]-expected[c])<tolerance,`Instant integral ${start}, component ${c}`);
  assert(Math.abs(realtime[c]-expected[c])<tolerance,`Realtime integral ${start}, component ${c}`);
 }
}
// A static pool really evolves; multiplying its initial image is not equivalent.
const integrated=integrate(163.994,239.169,1000),frozen=M.fractions(163.994).weights[0]*239.169;
assert(Math.abs(integrated[0]-frozen)/integrated[0]>.2);
console.log('OK: residual contrast, mass conservation, unchanged first-pass/late fields, real pool intervals, dynamic frame boundaries, speed invariance and voiding boundary.');

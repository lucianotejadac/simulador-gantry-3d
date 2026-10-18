const assetFetch=require('./asset_fetch.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8').replace(/\r\n/g,'\n');
const engine=fs.readFileSync('scripts/bone_acquisition.js','utf8').replace(/\r\n/g,'\n');
assert(html.includes(engine));
const ctx=vm.createContext({window:{},document:{getElementById:()=>null}});
vm.runInContext(engine,ctx);
const {Acquisition,poisson,suggestedGoal,estimatedSeconds}=ctx.window.GANTRY_BONE_CORE;
function seeded(seed=145){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};}
function point(index,sum=2000000){const values=new Float32Array(128*128),cdf=new Float64Array(values.length);values[index]=sum;cdf.fill(sum,index);return {values,cdf,sum};}
const a=point(10),b=point(20,1000000),zero=point(0,0);
assert.equal(suggestedGoal('bone','Cabeza',7200).counts,400000);
assert.equal(suggestedGoal('bone','Torax',7200).counts,1000000);
assert.equal(suggestedGoal('bone','Piernas / pies',7200).counts,250000);
assert.equal(suggestedGoal('bone','Cabeza',7199).delayed,false);
assert.equal(suggestedGoal('mibi','Torax',7200).counts,100000);
assert.equal(estimatedSeconds(a,1000,400000),400);
assert.equal(estimatedSeconds(b,1000,400000),800);
assert.equal(estimatedSeconds(zero,1000,400000),Infinity);
// Same rate and clock: a larger goal takes proportionally longer; no fake delay.
const smallGoal=new Acquisition(128,'counts',100000,seeded());
const largeGoal=new Acquisition(128,'counts',400000,seeded());
smallGoal.step([a,b],1000,Infinity);largeGoal.step([a,b],1000,Infinity);
for(let j=0;j<2;j++)assert(Math.abs(largeGoal.heads[j].elapsed/smallGoal.heads[j].elapsed-4)<.04);
for(const mu of [.2,5,30,200,10000]){
 const rng=seeded(),N=60000;let sum=0,sq=0;
 for(let i=0;i<N;i++){const x=poisson(mu,rng);assert(x>=0&&Number.isInteger(x));sum+=x;sq+=x*x;}
 const mean=sum/N,variance=sq/N-mean*mean;
 assert(Math.abs(mean-mu)<6*Math.sqrt(mu/N));assert(Math.abs(variance-mu)/mu<.035);
}
assert.throws(()=>new Acquisition(128,'time',NaN));assert.throws(()=>new Acquisition(128,'counts',1.1));
const counts=new Acquisition(128,'counts',1000,seeded());counts.step([a,b],1000,20);
assert(counts.finished);assert(counts.heads.every(h=>h.total===1000));
assert(counts.heads[0].elapsed<counts.heads[1].elapsed);
assert.equal(counts.heads[0].counts[10],1000);assert.equal(counts.heads[1].counts[20],1000);
const moved=new Acquisition(128,'time',10,seeded());moved.step([a,b],1000,4);
const before=moved.heads.map(h=>h.counts.slice());moved.step([point(100),point(200)],1000,20);
assert(moved.finished);assert(moved.heads.every(h=>h.elapsed===10));
assert.equal(moved.heads[0].counts[10],before[0][10]);assert(moved.heads[0].counts[100]>0);
assert.equal(moved.heads[1].counts[20],before[1][20]);assert(moved.heads[1].counts[200]>0);
for(const h of moved.heads)assert.equal(h.total,h.counts.reduce((x,y)=>x+y,0));
const empty=new Acquisition(128,'time',60,seeded());empty.step([zero,zero],4000,60);
assert(empty.finished);assert(empty.heads.every(h=>h.total===0));
const noCounts=new Acquisition(128,'counts',50,seeded());noCounts.step([zero,zero],4000,10);assert(!noCounts.finished);
const chunked=new Acquisition(128,'counts',51000,seeded());let chunks=0;
while(!chunked.finished){chunked.step([a,b],4000,Infinity,20000);chunks++;}
assert.equal(chunks,3);assert(chunked.heads.every(h=>h.total===51000));

// Real ICRP projections and production field sampler; no image screenshots.
const packed=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const linearContext=vm.createContext({window:{GANTRY_ICRP_DATA:Object.fromEntries(['down','dmsa','maa','thyroid','exploration','parathyroid'].map(k=>[k,packed[k]]))},Uint8Array,Uint16Array,Float32Array,Float64Array,Blob,Response,DecompressionStream,fetch:assetFetch,atob});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),linearContext);

(async()=>{
 const api=linearContext.window.GANTRY_ICRP;await api.ready;const pose=api.poses.down;
 const fields=[0,pose.angles.indexOf(180)].map(i=>api.field(pose,{lo:i,hi:i,mix:0},{x:pose.width/2-90,y:pose.headRow+140,w:180,h:180},128,128,false,false,{contrast:1,countFactor:1,haloAlpha:0,haloBlur:0},1));
 assert(fields.every(f=>f.sum>0));
 const real=new Acquisition(128,'time',60,seeded());real.step(fields,4000,60);
 real.heads.forEach((h,j)=>{const expected=fields[j].sum*4000*60/2000000;assert(Math.abs(h.total-expected)<6*Math.sqrt(expected));assert(h.counts.filter(v=>v>0).length>100);});

 // Newly projected organ studies use the same detector crop and count engine.
 for(const study of ['dmsa','maa','thyroid','exploration','parathyroid']){
  const organPose=api.poses[study],metrics={contrast:1,countFactor:1,haloAlpha:0,haloBlur:0};
  const crop={x:organPose.width/2-90,y:organPose.headRow+({dmsa:195,maa:125,thyroid:65,exploration:65,parathyroid:65}[study]),w:180,h:180};
  const pair=[0,36].map(i=>api.field(organPose,{lo:i,hi:i,mix:0},crop,128,128,false,false,metrics,1));
  const high=api.field(organPose,{lo:0,hi:0,mix:0},crop,256,256,false,false,metrics,2);
  assert(pair.every(f=>f.sum>10000));
  assert(Math.abs(high.sum/pair[0].sum-1)<.01,'Matrix must conserve rate: '+study);
  const timed=new Acquisition(128,'time',60,seeded());timed.step(pair,4000,60);
  timed.heads.forEach((h,j)=>{const expected=pair[j].sum*4000*60/2000000;assert(Math.abs(h.total-expected)<6*Math.sqrt(expected));});
  const counted=new Acquisition(128,'counts',2500,seeded());counted.step(pair,4000,Infinity);
  assert(counted.finished);assert(counted.heads.every(h=>h.total===2500));
 }

 // Drive the actual UI controller with a clock and a minimal DOM substitute.
 let now=0;const els=new Map(),intervals=[];
 const context2d={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};
 function element(id){return {id,hidden:false,disabled:false,value:'',textContent:'',classList:{toggle(){}},width:256,height:256,getContext:()=>context2d,focus(){}};}
 const document={hidden:false,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},createElement:()=>element('canvas'),addEventListener(){}};
 const el=id=>document.getElementById(id);
 const window={GANTRY:{G:{}},GANTRY_LIVE:{settings:{matrix:128},update(){window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);}}};
 const ui=vm.createContext({window,document,performance:{now:()=>now},setInterval:fn=>intervals.push(fn),setTimeout});
 vm.runInContext(engine,ui);
 window.GANTRY_MDP={seconds:7200,render(){}};
 window.GANTRY_LIVE.state={d1:{segment:'Cabeza'},d2:{segment:'Cabeza'}};
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);
 el('boneAcqStart').onclick();
 assert.equal(el('boneAcqTarget').value,'400000');
 assert(el('boneAcqEstimate').textContent.includes('D1: 6:40'));
 assert(el('boneAcqEstimate').textContent.includes('D2: 13:20'));
 el('boneAcqTarget').value='123456';el('boneAcqTarget').oninput();
 window.GANTRY_LIVE.state.d1.segment='Torax';
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);
 assert.equal(el('boneAcqTarget').value,'123456','Movement must preserve a manually entered goal');
 window.GANTRY_BONE_ACQ.sync('dmsa',[a,b],1000);
 assert.equal(el('boneAcqTarget').value,'100000');
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);
 assert.equal(el('boneAcqTarget').value,'123456','Study switching must preserve the goal');
 el('boneAcqSuggested').onclick();assert.equal(el('boneAcqTarget').value,'1000000');
 el('boneAcqCriterion').value='time';el('boneAcqCriterion').onchange();
 assert.equal(el('boneAcqTarget').value,'300');
 delete window.GANTRY_MDP;
 el('boneAcqName1').value='Anterior';el('boneAcqName2').value='Posterior';
 el('boneAcqCriterion').value='time';el('boneAcqTarget').value='60';el('boneAcqSetup').onsubmit({preventDefault(){}});
 now=1000;intervals[0]();assert.equal(window.GANTRY_BONE_ACQ.state.heads[0].elapsed,1);
 el('boneAcqSpeed').value='10';el('boneAcqSpeed').onchange();now=2000;intervals[0]();assert.equal(window.GANTRY_BONE_ACQ.state.heads[0].elapsed,11);
 el('boneAcqPause').onclick();now=4000;intervals[0]();assert.equal(window.GANTRY_BONE_ACQ.state.heads[0].elapsed,11);
 el('boneAcqPause').onclick();now=4500;intervals[0]();assert.equal(window.GANTRY_BONE_ACQ.state.heads[0].elapsed,16);
 window.GANTRY_BONE_ACQ.sync('mibi',[a,b],1000);now=5500;intervals[0]();assert.equal(window.GANTRY_BONE_ACQ.state,null);
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);assert(window.GANTRY_BONE_ACQ.state.paused);assert.equal(window.GANTRY_BONE_ACQ.state.heads[0].elapsed,16);await el('boneAcqInstant').onclick();
 assert(window.GANTRY_BONE_ACQ.state.finished);assert(window.GANTRY_BONE_ACQ.state.heads.every(h=>h.elapsed===60));
 assert.equal(el('liveMatrix128').disabled,false);
 el('boneAcqCriterion').value='counts';el('boneAcqTarget').value='100';el('boneAcqSetup').onsubmit({preventDefault(){}});
 window.GANTRY_BONE_ACQ.sync('bone',[zero,b],1000);await el('boneAcqInstant').onclick();assert(!window.GANTRY_BONE_ACQ.state.finished);assert(el('boneAcqStatus').textContent.includes('Sin señal'));
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);await el('boneAcqInstant').onclick();assert(window.GANTRY_BONE_ACQ.state.heads.every(h=>h.total===100));
 // Exam-wide cancellation freezes totals and rejects instant acquisitions across studies.
 window.GANTRY_EXAM={blocked:false,refresh(){}};
 el('boneAcqCriterion').value='time';el('boneAcqTarget').value='100';
 el('boneAcqSetup').onsubmit({preventDefault(){}});
 now+=1000;intervals.at(-1)();
 window.GANTRY_EXAM.blocked=true;window.GANTRY_BONE_ACQ.cancelExam();
 const stopped=JSON.stringify(window.GANTRY_BONE_ACQ.state.heads);
 assert(window.GANTRY_BONE_ACQ.state.cancelled);
 now+=10000;intervals.at(-1)();await el('boneAcqInstant').onclick();
 assert.equal(JSON.stringify(window.GANTRY_BONE_ACQ.state.heads),stopped);
 window.GANTRY_BONE_ACQ.sync('dmsa',[a,b],1000);await el('boneAcqInstant').onclick();
 assert.equal(window.GANTRY_BONE_ACQ.state,null);
 window.GANTRY_EXAM.blocked=false;window.GANTRY_BONE_ACQ.resetExam();
 window.GANTRY_BONE_ACQ.sync('bone',[a,b],1000);assert.equal(window.GANTRY_BONE_ACQ.state,null);
 const report={result:'OK',poisson_mean_variance:true,exact_per_detector_targets:true,exact_time_stop:true,motion_retains_counts:true,empty_field_no_counts:true,chunked_instant_counts:true,real_icrp_expected_counts:true,fast_forward_pause_resume:true,study_switch_pauses:true,instant_time_and_counts:true,matrix_unlocks_on_completion:true,browser_layout:'Not exercised by this offline test'};
 fs.writeFileSync('assets/icrp145/bone-acquisition-verification.json',JSON.stringify(report,null,2)+'\n');console.log(report);
})().catch(error=>{console.error(error);process.exitCode=1;});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const assetFetch=require('./asset_fetch.cjs'),downloads=[];
const html=fs.readFileSync('index.html','utf8');
const data=JSON.parse(html.match(/window.GANTRY_MIBI_DATA=(.*?);<\/script>/)[1]);
const icrp=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const nodes=new Map(),callbacks=[];
const el=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:true,validity:{valid:true},dataset:{},closest:()=>({hidden:false})});return nodes.get(id);};
el('mibiUnit').value='MBq';
const ctx=vm.createContext({window:{GANTRY_MIBI_DATA:data,GANTRY_ICRP_DATA:icrp},document:{getElementById:el,readyState:'complete'},performance:{now:()=>0},setInterval:f=>callbacks.push(f),Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Blob,Response,DecompressionStream,fetch:url=>{downloads.push(url);return assetFetch(url);}});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('scripts/mibi_kinetics.js','utf8'),ctx);
const M=ctx.window.GANTRY_MIBI;
const time=s=>{el('mibiMinutes').value=s/60;el('mibiMinutes').onchange();};
const protocol=p=>{el('mibiProtocol').value=p;el('mibiProtocol').onchange();};
const activity=a=>{el('mibiActivity').value=a;el('mibiActivity').oninput();};
for(const p of ['rest','exercise','pharmacologic'])for(let s=0;s<=43200;s+=1){
 for(const voiding of [true,false]){
  const f=M.fractions(s,p,voiding);
  assert(f.weights.every(v=>v>=0&&Number.isFinite(v)));
  assert(Math.abs(f.weights.reduce((a,b)=>a+b,0)+f.excreted-f.decay)<1e-12,'activity balance');
 }
}
const times=[5,30,60,120,240];
for(const [p,heart,liver] of [['rest',[1.2,1.1,1,1,.8],[19.6,12.2,5.6,2.2,.7]],['exercise',[1.5,1.4,1.4,1.2,1],[5.9,4.5,2.4,.9,.3]]]){
 times.forEach((t,i)=>{const f=M.fractions(t*60,p);assert(Math.abs(f.biologicalHeart-heart[i]/100)<1e-12);assert(Math.abs(f.biologicalLiver-liver[i]/100)<1e-12);assert(Math.abs(f.heart-heart[i]/100*2**(-t/360.402))<1e-12,'physical decay exactly once');});
}
assert.equal(M.fractions(0).blood,1);assert.equal(M.fractions(0).heart,0);
assert(Math.abs(M.fractions(360.402*60).decay-.5)<1e-12);
assert.equal(M.fractions(7200).bladder,0);assert(M.fractions(7200,'rest',false).bladder>0);
for(const [p,min] of [['rest',45],['exercise',15],['pharmacologic',60]]){
 assert.equal(M.timing(min*60-1,p).phase,'early');assert.equal(M.timing(min*60,p).phase,'usual');
 assert.equal(M.timing(121*60,p).phase,'delayed');assert.equal(M.timing(241*60,p).phase,'prolonged');
 assert(M.fractions(43200,p).heart>0,'late image is not artificially zeroed');
}
protocol('pharmacologic');assert.equal(el('mibiPharmNote').hidden,false);protocol('rest');
const metrics={contrast:1,countFactor:1,haloAlpha:0,haloBlur:0};
(async()=>{
 await Promise.all([M.load(),M.load()]);assert.equal(downloads.length,1);
 const p=M.geometry(),n=128,h=Math.ceil(p.height/p.width*n),crop={x:0,y:0,w:p.width,h:p.height};
 const sums={};
 for(const angle of [0,90,180,270]){
  const i=p.angles.indexOf(angle),cache={};
  const field=s=>M.field(p,{lo:i,hi:i,mix:0},crop,n,h,false,false,metrics,1,cache,s);
  const early=field(300),normal=field(3600),late=field(21600),bases=cache.bases;
  assert(early.sum>0&&normal.sum>0&&late.sum>0);assert(late.sum<normal.sum);
  assert(normal.values.some((v,j)=>Math.abs(v-early.values[j])>1));
  assert.equal(late.cdf.at(-1),late.sum);assert.equal(cache.bases,bases);
  activity(370);const half=normal.sum*M.rate/2000000;activity(740);assert.equal(normal.sum*M.rate/2000000,2*half);
  protocol('exercise');const exercise=field(3600);assert.notEqual(exercise.sum,normal.sum);assert.equal(cache.bases,bases);protocol('rest');
  sums[angle]={fiveMinCps:early.sum*M.rate/2000000,oneHourCps:normal.sum*M.rate/2000000,sixHourCps:late.sum*M.rate/2000000};
 }
 el('mibiUnit').value='mCi';el('mibiUnit').onchange();assert.equal(+el('mibiActivity').value,20);activity(10);assert.equal(M.rate,37000);el('mibiUnit').value='MBq';el('mibiUnit').onchange();activity(740);
 // Exercise the real controller, including its render/advance contract.
 const elements=new Map(),timers=[];let now=0,updates=0;
 const canvas={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};
 const element=id=>({id,value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},width:128,height:128,getContext:()=>canvas,focus(){}});
 const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:()=>element('canvas'),addEventListener(){}};
 const uiEl=id=>document.getElementById(id);
 const bases=Array.from({length:10},(_,c)=>{const a=new Float32Array(128*128);a[c]=1;return a;});
 const field=M.mix(bases);
 const window={GANTRY_MIBI:M,GANTRY:{G:{}},GANTRY_LIVE:{settings:{study:'mibi',matrix:128},update(){assert(++updates<20,'recursive live updates');window.GANTRY_BONE_ACQ.advance();window.GANTRY_BONE_ACQ.sync('mibi',[field,field],M.rate);}}};
 const ui=vm.createContext({window,document,performance:{now:()=>now},setInterval:f=>timers.push(f),setTimeout});
 vm.runInContext(fs.readFileSync('scripts/bone_acquisition.js','utf8'),ui);
 uiEl('boneAcqName1').value='MIBI AP';uiEl('boneAcqName2').value='MIBI PA';
 uiEl('boneAcqCriterion').value='time';uiEl('boneAcqTarget').value='60';uiEl('boneAcqSetup').onsubmit({preventDefault(){}});
 now=1000;timers[0]();assert.equal(M.seconds,3601);
 uiEl('boneAcqSpeed').value='10';uiEl('boneAcqSpeed').onchange();now=2000;timers[0]();assert.equal(M.seconds,3611);
 uiEl('boneAcqPause').onclick();now=5000;timers[0]();assert.equal(M.seconds,3611);
 await uiEl('boneAcqInstant').onclick();assert.equal(M.seconds,3660);assert(window.GANTRY_BONE_ACQ.state.finished);
 assert(window.GANTRY_BONE_ACQ.state.heads.every(h=>h.elapsed===60));
 const Core=window.GANTRY_BONE_CORE.Acquisition;
 time(0);const changing=new Core(128,'time',60);M.step(changing,[field,field],60);
 assert(changing.heads.every(h=>h.counts[0]>0&&h.counts[1]>0),'heart rises while bolus blood clears');
 time(43200-2);const limited=new Core(128,'time',60);limited.mibiStart=M.begin();M.step(limited,[field,field],60);limited.mibiEnd=M.metadata();
 assert(limited.finished&&limited.mibiLimit);assert.equal(M.seconds,43200);assert(limited.heads.every(h=>h.elapsed===2));
 const saveCtx=vm.createContext({window:{},structuredClone,crypto:{randomUUID:()=> 'mibi-test'}});
 vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),saveCtx);
 const saved=saveCtx.window.GANTRY_BONE_STORAGE.snapshot(limited,['AP','PA'],{study:'mibi'});
 limited.mibiStart.activityMBq=1;assert.equal(saved.mibi.start.activityMBq,740);assert.equal(saved.mibi.end.seconds,43200);assert(saved.mibi.limit);assert.equal(saved.mibi.start.protocol,'rest');
 time(3600);const counted=new Core(128,'counts',1000);M.step(counted,[field,field],60);assert(counted.finished);assert(counted.heads.every(h=>h.total===1000));
 fs.writeFileSync('assets/icrp145/mibi-kinetic-verification.json',JSON.stringify({result:'OK',checks:['nonnegative balanced compartments through 12 h','label biological heart/liver anchors','physical decay once','three protocol windows','late signal retained','optional voiding','real organ bases at four angles','activity controls and unit conversion','spatial cache reuse','protocol changes distribution','dynamic time/count acquisition','fast-forward pause instant','12 h boundary','immutable saved kinetics'],wholeBodyExpectedCps:sums},null,2)+'\n');
 console.log('OK: MIBI organ kinetics, label anchors, decay, protocols, real projections, activity controls and acquisition integration.');
})().catch(e=>{console.error(e);process.exitCode=1;});

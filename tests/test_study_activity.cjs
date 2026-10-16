const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('scripts/study_activity.js','utf8');
const window={},ctx=vm.createContext({window,document:{getElementById:()=>null},structuredClone,crypto:require('node:crypto').webcrypto,Float64Array});
vm.runInContext(source,ctx);const A=window.GANTRY_ACTIVITY;
for(const [id,dose] of Object.entries({thyroid:5,dmsa:3,maa:3,parathyroid:20,mag3:5,exploration:100})){
 assert.equal(A.metadata(id).activityMCi,dose);assert.equal(A.metadata(id).activityMBq,dose*37);
 const baseline=A.factor(id);assert(A.setActivity(id,dose*2));assert.equal(A.factor(id),baseline*2);
 assert(A.setActivity(id,dose*37,'MBq'));assert.equal(A.factor(id),baseline,'Changing units preserves physical activity');
 for(const invalid of [0,-1,NaN,Infinity,'bad'])assert(!A.setActivity(id,invalid));
 assert.equal(A.metadata(id).activityMCi,dose,'Invalid input cannot change the model');
}
assert.equal(A.metadata('exploration').route,'Oral');assert.equal(A.metadata('exploration').seconds,7*86400);
assert(Math.abs(A.factor('exploration')-2**(-2/8.02))<1e-12,'Apply day 5 to day 7 correction only once');
for(const dose of [50,100,150,200])assert(A.setActivity('exploration',dose));
assert(!A.setActivity('exploration',125));assert(A.setActivity('exploration',7400,'MBq'));
assert.equal(A.rate('bone'),null);assert.equal(A.rate('mibi'),null);assert.equal(A.rate('mag3'),null);
window.GANTRY_BONE_ACQ={active:true};assert(!A.setActivity('thyroid',10));window.GANTRY_BONE_ACQ.active=false;
window.GANTRY_MAG3={state:{finished:false}};assert(!A.setActivity('mag3',10));window.GANTRY_MAG3.state.finished=true;
assert(A.setActivity('mag3',10));assert.equal(A.factor('mag3'),2);
vm.runInContext(fs.readFileSync('scripts/final_preview.js','utf8'),ctx);
const predict=window.GANTRY_FINAL_PREVIEW.predict,field={values:new Float64Array([500000,500000,500000,500000]),sum:2000000};
for(const id of ['thyroid','dmsa','maa','parathyroid','exploration']){
 const original=A.profiles[id].mCi;A.setActivity(id,original);
 const rate=A.rate(id),f=predict([field],{mode:'time',target:60,rate})[0];
 A.setActivity(id,original*2);const twice=predict([field],{mode:'time',target:60,rate:A.rate(id)})[0];
 assert.equal(twice.sum,f.sum*2,'Fixed time gets twice the expected counts');
 const a=predict([field],{mode:'counts',target:100000,rate})[0],b=predict([field],{mode:'counts',target:100000,rate:A.rate(id)})[0];
 assert.equal(a.sum,b.sum);assert.equal(a.elapsed,b.elapsed*2,'Fixed count target takes half the time');
}
vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),ctx);
const activity=A.metadata('thyroid'),session={study:'thyroid',n:2,mode:'time',target:60,finished:true,heads:[],administeredActivity:activity};
const saved=window.GANTRY_BONE_STORAGE.snapshot(session,['AP','PA'],{study:'thyroid',administeredActivity:{activityMBq:99999}});
assert.equal(saved.settings.administeredActivity.activityMBq,activity.activityMBq,'Saved settings use acquisition dose, not a later UI selection');
activity.activityMBq=1;assert.notEqual(saved.administeredActivity.activityMBq,1,'Save an independent administration record');
for(const id of ['mdp','mibi'])assert(html.includes(`id="${id}Unit"`)&&new RegExp(`id="${id}Unit"[^>]*><option>mCi</option>`).test(html),'mCi default');
assert(html.includes('DÍA 7'));assert(html.includes('administeredActivity:window.GANTRY_ACTIVITY'));
console.log('OK: all activity defaults, mCi/MBq equivalence, oral presets, day-7 decay, locking, final count/time response, saved metadata and existing model fallback.');

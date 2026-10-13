/* Snapshot/UI tests; IndexedDB persistence itself is checked in Chrome. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const storeSource=fs.readFileSync('scripts/bone_acquisition_store.js','utf8');
const engine=fs.readFileSync('scripts/bone_acquisition.js','utf8');
const html=fs.readFileSync('index.html','utf8');assert(html.includes(storeSource));
const database=new Map();let failSave=false;
const memoryStore={async list(){return [...database.values()].map(({heads,...r})=>({...r,totals:heads.map(h=>h.total)}));},async get(id){return structuredClone(database.get(id));},async save(r){if(failSave){const e=Error('Full');e.name='QuotaExceededError';throw e;}database.set(r.id,structuredClone(r));}};
function environment(){
 let now=0;const els=new Map();
 function el(id){if(!els.has(id))els.set(id,{id,value:'',textContent:'',width:256,height:256,hidden:false,disabled:false,children:[],classList:{toggle(){}},focus(){},append(x){this.children.push(x);},replaceChildren(){this.children=[];},getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};}});return els.get(id);}
 const document={getElementById:el,createElement:()=>({value:'',textContent:'',width:256,height:256,getContext:()=>el('canvas').getContext()}),addEventListener(){},hidden:false};
 const values=new Float32Array(128*128);values[5]=2000000;const cdf=new Float64Array(values.length);cdf.fill(2000000,5);
 const field={values,cdf,sum:2000000};
 const window={GANTRY:{G:{rot:0}},GANTRY_LIVE:{settings:{matrix:128},update(){window.GANTRY_BONE_ACQ.sync('bone',[field,field],1000);}}};
 const context=vm.createContext({window,document,performance:{now:()=>now},crypto:webcrypto,structuredClone,Uint32Array,setInterval(){},setTimeout});
 vm.runInContext(storeSource,context);
 const storage=window.GANTRY_BONE_STORAGE;
 storage.createStore=()=>memoryStore;
 vm.runInContext(engine,context);
 const submit=(count,name1,name2)=>{el('boneAcqCriterion').value='counts';el('boneAcqTarget').value=String(count);el('boneAcqName1').value=name1;el('boneAcqName2').value=name2;el('boneAcqSetup').onsubmit({preventDefault(){}});};
 return {el,window,storage,submit};
}
(async()=>{
 const a=environment();a.submit(3,'  ','Posterior');assert.equal(a.window.GANTRY_BONE_ACQ.state,null);
 const name='<img src=x onerror=alert(1)> Anterior';
 a.submit(3,name,'Óseo posterior');await a.el('boneAcqInstant').onclick();await a.el('boneAcqSave').onclick();
 assert.equal(database.size,1);const first=[...database.values()][0];a.storage.validate(first);
 assert.equal(first.names[0],name);assert.equal(first.heads[0].counts[5],3);
 assert(a.el('boneAcqTitle1').textContent.includes(name));
 a.submit(7,'Nueva anterior','Nueva posterior');await a.el('boneAcqInstant').onclick();
 assert.equal(first.heads[0].counts[5],3);assert.equal(a.window.GANTRY_BONE_ACQ.state.heads[0].total,7);
 a.el('boneAcqSaved').value=first.id;await a.el('boneAcqSaved').onchange();
 assert(a.el('boneAcqTitle1').textContent.includes(name));assert(a.el('boneAcqInfo1').textContent.startsWith('3 cuentas'));
 assert.equal(a.window.GANTRY_BONE_ACQ.state.heads[0].total,7);
 a.el('boneAcqSaved').value='current';await a.el('boneAcqSaved').onchange();
 assert(a.el('boneAcqInfo1').textContent.startsWith('7 cuentas'));assert(a.el('boneAcqTitle1').textContent.includes('Nueva anterior'));
 failSave=true;await a.el('boneAcqSave').onclick();assert(a.el('boneAcqCacheStatus').textContent.includes('almacenamiento lleno'));assert.equal(database.size,1);failSave=false;
 await a.el('boneAcqSave').onclick();assert.equal(database.size,2);
 const b=environment();await new Promise(r=>setTimeout(r,0));
 assert.equal(b.el('boneAcqSaved').children.length,3);
 b.el('boneAcqSaved').value=first.id;await b.el('boneAcqSaved').onchange();assert(b.el('boneAcqInfo1').textContent.startsWith('3 cuentas'));assert.equal(b.window.GANTRY_BONE_ACQ.state,null);
 b.el('boneAcqSaved').value='current';await b.el('boneAcqSaved').onchange();assert.equal(b.el('boneAcqInfo1').textContent,'Esperando adquisición');assert.equal(b.el('boneAcqProgress1').value,0);
 b.submit(100,'En curso D1','En curso D2');b.el('boneAcqSaved').value=first.id;await b.el('boneAcqSaved').onchange();assert(b.window.GANTRY_BONE_ACQ.state.paused);
 const broken=structuredClone(first);broken.heads[0].counts[5]=999;assert.throws(()=>b.storage.validate(broken));
 assert.throws(()=>b.storage.validate({...first,version:2}));
 console.log('OK: names required, literal safe labels, immutable snapshots, prior image browsing without replacing current data, pause for review, quota failure preserves current, catalogue after new controller, corrupt-record rejection. IndexedDB reload checked separately in Chrome.');
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Snapshot/UI tests; IndexedDB persistence itself is checked in Chrome. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const storeSource=fs.readFileSync('scripts/bone_acquisition_store.js','utf8');
const engine=fs.readFileSync('scripts/bone_acquisition.js','utf8');
const html=fs.readFileSync('index.html','utf8');assert(html.includes(storeSource));
const database=new Map();let failSave=false;
const memoryStore={async list(){return [...database.values()].map(({heads,...r})=>({...r,totals:heads.map(h=>h.total)}));},async get(id){return structuredClone(database.get(id));},async save(r){if(failSave){const e=Error('Full');e.name='QuotaExceededError';throw e;}database.set(r.id,structuredClone(r));}};
function environment(whole=false){
 let now=0;const els=new Map();
 function el(id){if(!els.has(id))els.set(id,{id,value:'',textContent:'',width:256,height:256,hidden:false,disabled:false,children:[],classList:{toggle(){}},focus(){},append(x){this.children.push(x);},replaceChildren(){this.children=[];},getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};}});return els.get(id);}
 const document={getElementById:el,createElement:()=>({value:'',textContent:'',width:256,height:256,getContext:()=>el('canvas').getContext()}),addEventListener(){},hidden:false};
 const values=new Float32Array(128*128);values[5]=2000000;const cdf=new Float64Array(values.length);cdf.fill(2000000,5);
 const field={values,cdf,sum:2000000};
 const G={rot:0,tableZ:184};
 const wholeValues=new Float32Array(128*320),wholeCdf=new Float64Array(wholeValues.length);wholeValues[5]=2000000;wholeCdf.fill(2000000,5);
 const window={GANTRY:{G},GANTRY_LIVE:{settings:{matrix:128},update(){window.GANTRY_BONE_ACQ.sync('bone',[field,field],1000);}},GANTRY_BONE_WHOLE:{position:()=>({ok:G.tableZ===200,reason:'Centra en cráneo'}),fields:()=>({height:320,fields:[1,2].map(()=>({values:wholeValues,cdf:wholeCdf,sum:2000000}))})}};
 const context=vm.createContext({window,document,performance:{now:()=>now},crypto:webcrypto,structuredClone,Uint32Array,setInterval(){},setTimeout});
 vm.runInContext(storeSource,context);
 const storage=window.GANTRY_BONE_STORAGE;
 storage.createStore=()=>memoryStore;
 vm.runInContext(engine,context);
 if(whole){el('boneAcqType').value='whole';el('boneAcqType').onchange();}
 const submit=(count,name1,name2)=>{el('boneAcqCriterion').value='counts';el('boneAcqTarget').value=String(count);el('boneAcqName1').value=name1;el('boneAcqName2').value=name2;el('boneAcqSetup').onsubmit({preventDefault(){}});};
 return {el,window,storage,submit,tick:seconds=>{now+=seconds*1000;window.GANTRY_BONE_ACQ.advance();}};
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
 const c=environment(true);assert(c.el('boneAcqStart').disabled);
 c.submit(30,'Cuerpo anterior','Cuerpo posterior');assert.equal(c.window.GANTRY_BONE_ACQ.state,null);
 c.window.GANTRY.G.tableZ=200;c.window.GANTRY_LIVE.update();assert(!c.el('boneAcqStart').disabled);
 c.submit(30,'Cuerpo anterior','Cuerpo posterior');assert.equal(c.window.GANTRY_BONE_ACQ.state.height,320);
 c.window.GANTRY.G.tableZ=184;c.tick(1);assert(c.window.GANTRY_BONE_ACQ.state.paused);assert.equal(c.window.GANTRY_BONE_ACQ.state.heads[0].total,0);
 await c.el('boneAcqInstant').onclick();assert(!c.window.GANTRY_BONE_ACQ.state.finished);
 c.window.GANTRY.G.tableZ=200;await c.el('boneAcqInstant').onclick();await c.el('boneAcqSave').onclick();
 const wholeRecord=[...database.values()].at(-1);assert.equal(wholeRecord.height,320);assert.equal(wholeRecord.kind,'whole');c.storage.validate(wholeRecord);
 c.el('boneAcqType').value='static';c.submit(5,'Estática anterior','Estática posterior');await c.el('boneAcqInstant').onclick();
 assert.equal(c.el('boneAcqD1').height,128);
 c.el('boneAcqSaved').value=wholeRecord.id;await c.el('boneAcqSaved').onchange();assert.equal(c.el('boneAcqD1').height,320);
 c.el('boneAcqSaved').value='current';await c.el('boneAcqSaved').onchange();assert.equal(c.el('boneAcqD1').height,128);
 console.log('OK: names required, literal safe labels, immutable snapshots, prior image browsing without replacing current data, pause for review, quota failure preserves current, catalogue after new controller, corrupt-record rejection. IndexedDB reload checked separately in Chrome.');
})().catch(e=>{console.error(e);process.exitCode=1;});

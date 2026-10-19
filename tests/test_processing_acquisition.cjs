const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const messages=[],listeners={},nodes=new Map(),intervals=[],calls=[];
const frame={contentWindow:{postMessage:data=>messages.push(data)}};
const base={kind:'static',matrix:64,zoom:1.5,collimator:'MELP',energyCenter:145,windowWidth:15,activityMci:15,minutes:125,mode:'time',target:5,velocity:12,names:['Anterior','Posterior']};
const live={settings:{study:'bone',matrix:256,zoom:1,collimator:'LEHR',energyCenter:140,windowWidth:20},ready:true,signal:{mode:'live'},update(){},
 setStudy(v){this.settings.study=v;},setSignalMode(){},setMatrix(v){this.settings.matrix=v;},setZoom(v){this.settings.zoom=v;},setCollimator(v){this.settings.collimator=v;},setEnergyCenter(v){this.settings.energyCenter=v;},setWindowWidth(v){this.settings.windowWidth=v;}};
const engine={active:false,readyForProcessing:true,state:null,startConfigured(c){calls.push(structuredClone(c));this.active=true;this.state={id:'exam1'};return 'exam1';},async controlFromProcessing(a){calls.push(a);}};
const w={GANTRY_LIVE:live,GANTRY_BONE_ACQ:engine,GANTRY_MDP:{metadata:()=>({activityMBq:740,seconds:7200})},GANTRY:{G:{}},GANTRY_EXAM:{blocked:false},GANTRY_PROCESSING:{active:true},addEventListener:(n,f)=>listeners[n]=f};
const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'Geometría actual',dispatchEvent:e=>calls.push([id,e.type])});return nodes.get(id);},createElement:()=>({})};
const c=vm.createContext({window:w,document,location:{origin:'http://local'},setInterval:fn=>intervals.push(fn),setTimeout,performance,Event});
vm.runInContext(fs.readFileSync('scripts/processing_acquisition_config.js','utf8'),c);
const validate=w.GANTRY_PROCESSING_CONFIG.validate;
assert.equal(validate(base).target,5);
for(const [key,v] of [['matrix',1024],['matrix',32],['zoom',0],['windowWidth',1],['energyCenter',NaN],['activityMci',0],['minutes',180],['velocity',61],['target',5.5],['names',['','D2']],['kind','dynamic']])assert.throws(()=>validate({...base,[key]:v}),key);
assert.equal(validate({...base,kind:'whole',velocity:.1}).velocity,.1);
vm.runInContext(fs.readFileSync('scripts/processing_acquisition_bridge.js','utf8'),c);w.GANTRY_PROCESSING_ACQUISITION.attach(frame);
const send=async data=>listeners.message({origin:'http://local',source:frame.contentWindow,data:{version:1,request:1,...data}});
(async()=>{
 await listeners.message({origin:'http://foreign',source:frame.contentWindow,data:{type:'GANTRY_ACQUIRE_START',version:1,config:base}});assert.equal(calls.length,0);
 await listeners.message({origin:'http://local',source:{},data:{type:'GANTRY_ACQUIRE_START',version:1,config:base}});assert.equal(calls.length,0);
 await send({type:'GANTRY_ACQUIRE_START',config:{...base,matrix:1024}});assert.equal(calls.length,0);assert.match(messages.at(-1).error,/Matriz/);
 w.GANTRY_EXAM.blocked=true;await send({type:'GANTRY_ACQUIRE_START',config:base});assert.equal(calls.length,0);assert.match(messages.at(-1).error,/colisión/);w.GANTRY_EXAM.blocked=false;
 await send({type:'GANTRY_ACQUIRE_CONFIG',kind:'whole'});assert.equal(messages.at(-1).config.kind,'whole');assert.equal(messages.at(-1).config.activityMci,20);
 await send({type:'GANTRY_ACQUIRE_START',config:base});assert.equal(messages.at(-1).type,'GANTRY_ACQUIRE_STARTED');
 assert.equal(live.settings.matrix,64);assert.equal(live.settings.zoom,1.5);assert.equal(live.settings.collimator,'MELP');assert.equal(live.settings.energyCenter,145);assert.equal(live.settings.windowWidth,15);
 assert.equal(nodes.get('mdpActivity').value,'15');assert.equal(nodes.get('mdpUnit').value,'mCi');assert.equal(nodes.get('mdpMinutes').value,'125');assert.equal(calls.at(-1).target,5);assert.deepEqual(calls.at(-1).names,['Anterior','Posterior']);
 const count=calls.length;await send({type:'GANTRY_ACQUIRE_START',config:base});assert.equal(calls.length,count);assert.match(messages.at(-1).error,/activa/);
 await send({type:'GANTRY_ACQUIRE_ACTION',id:'other',action:'stop'});assert.equal(calls.length,count);
 for(const action of ['pause','fast','instant','stop','save']){await send({type:'GANTRY_ACQUIRE_ACTION',id:'exam1',action});assert.equal(calls.at(-1),action);}
 w.GANTRY_PROCESSING.active=false;const prior=messages.length;await send({type:'GANTRY_ACQUIRE_CONFIG',kind:'static'});assert.equal(messages.length,prior);
 const engineCode=fs.readFileSync('scripts/bone_acquisition.js','utf8');assert(!engineCode.includes('if(window.GANTRY_PROCESSING?.active){clock='),'Processing must not freeze acquisition');
 console.log('OK: native acquisition configuration, matrix/energy/activity/time mapping, exact goal, source/origin, collision lock, duplicate start and stale command rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});

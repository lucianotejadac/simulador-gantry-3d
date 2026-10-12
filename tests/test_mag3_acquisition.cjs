/* Offline runtime tests: genuine compressed data and sampling engine, mocked UI.
 * Does not claim browser layout/CSS verification. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const packed=JSON.parse(html.match(/window.GANTRY_MAG3_DATA=(.*?);\n/)[1]);
let now=0;const intervals=[],errors=[],elements=new Map(),events={};
function element(id){return {id,hidden:false,style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},focus(){},addEventListener(){},insertAdjacentElement(where,e){elements.set(e.id,e);},attachShadow(){return this.shadowRoot=doc();},value:({gain:'1',frame:'current',speed:'1'})[id]||'',disabled:false,checked:false,width:512,height:512,
 options:id==='frame'?[{}]:[],textContent:'',children:[],getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){}};},
 append(e){this.children.push(e);this.options.push(e);elements.set(e.id,e);},click(){},toDataURL(){return 'data:image/png;base64,';}};}
function doc(){const els=new Map();return {getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},createElement:id=>element(id),open(){},write(){},close(){}};}
const document=doc(),window={GANTRY_MAG3_DATA:packed,GANTRY_ICRP_DATA:{},GANTRY:{G:{arms:'down',rot:0,tableZ:140,tableH:92,detDist1:35,detDist2:35}},
 addEventListener:(n,fn)=>events[n]=fn,dispatchEvent:e=>events[e.type]?.(),
 open(){throw Error('MAG3 must not open a browser window');}};
const ctx=vm.createContext({window,document,Uint8Array,Uint16Array,Uint32Array,Float32Array,Float64Array,Uint8ClampedArray,
 Blob,Response,DecompressionStream,atob,URL,Event,performance:{now:()=>now},setTimeout,
 setInterval:fn=>intervals.push(fn),console:{error:e=>errors.push(e)}});
vm.runInContext(fs.readFileSync(path.join(root,'scripts/icrp_live.js'),'utf8'),ctx);
// Execute the production geometry bridge with deterministic neutral electronics.
vm.runInContext(`const wrap=x=>(x%360+360)%360,SCAN_TOP=200,SCAN_BOTTOM=16,TABLE_HEIGHT_REFERENCE_CM=92,ZOOM_MAGNIFICATION={1:1,2:1.7};
let physical={prone:false,headFirst:false},declared={prone:false,headFirst:false};
const acquisition={matrix:128,zoom:1,collimator:'LEHR',energyCenter:140,windowWidth:20};
const physicalPatientPosition=()=>physical,acquisitionPosition=()=>declared;
const distanceMetrics=()=>({countFactor:1,contrast:1,haloAlpha:0,haloBlur:0,blur:0});
${html.slice(html.indexOf('  function mag3Geometry('),html.indexOf("  window.addEventListener('mag3ready'"))}
window.GANTRY_LIVE={mag3Geometry,settings:acquisition,setStudy(s){acquisition.study=s;},update(G){window.GANTRY_MAG3.stateChanged(G);}};`,ctx);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/mag3_acquisition.js'),'utf8'),ctx);
function seeded(){let s=145;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return (s+.5)/4294967296;};}
(async()=>{
 const api=window.GANTRY_MAG3;await api.loading;assert(api.ready);assert.equal(packed.duration,1200);assert.equal(packed.edges.length,85);
 const geometry=window.GANTRY_LIVE.mag3Geometry(2,window.GANTRY.G);assert.equal(geometry.rawAngle,180);
 const coeff=api.coefficients(1200);assert(coeff.every(v=>v>=0));
 const s={n:128,geometry,cache:{},time:0,counts:new Uint32Array(128*128),frameCounts:new Uint32Array(128*128),expected:new Float64Array(128*128),
   total:0,expectedTotal:0,frameIndex:0,frames:[],random:seeded()};
 api.accumulate(s,60);const before=s.counts.slice(),expectedBefore=s.expectedTotal;assert(s.total>0);assert.equal(s.frames.length,30);
 const off=window.GANTRY_LIVE.mag3Geometry(2,{...window.GANTRY.G,tableZ:-100});s.geometry=off;api.accumulate(s,90);
 assert.equal(s.expectedTotal,expectedBefore);assert.deepEqual(s.counts,before);assert.equal(s.time,90);
 s.geometry=window.GANTRY_LIVE.mag3Geometry(2,{...window.GANTRY.G,tableZ:200});api.accumulate(s,120);
 assert(s.expectedTotal>expectedBefore,'Extra-renal field did not acquire');
 for(let i=0;i<before.length;i++)assert(s.counts[i]>=before[i],'Motion removed old events');
 const angular=api.mix(api.fields({...geometry,rawAngle:180},128,{}),api.coefficients(120));
 const lateral=api.mix(api.fields({...geometry,rawAngle:90},128,{}),api.coefficients(120));assert(angular.some((v,i)=>v!==lateral[i]));
 const zero=api.fields({...geometry,rawAngle:0},128,{}),close=api.fields({...geometry,rawAngle:360},128,{});assert.deepEqual(zero,close);
 const up=api.fields({...geometry,arms:'up'},128,{});assert(up.length===10);
 s.geometry=geometry;api.accumulate(s,1200);assert(s.finished);assert.equal(s.frames.length,84);
 const sum=new Uint32Array(s.counts.length);for(const f of s.frames)for(let i=0;i<sum.length;i++)sum[i]+=f.counts[i];assert.deepEqual(sum,s.counts);
 assert.equal(s.counts.reduce((a,b)=>a+b,0),s.total);assert(Math.abs(s.total-s.expectedTotal)<7*Math.sqrt(s.expectedTotal));
 api.inject();assert.equal(api.state.detector,2);
 const panel=elements.get('mag3Screen'),view=elements.get('viewMAG3');assert(panel);assert.equal(panel.hidden,false);
 now=5000;intervals.at(-1)();assert(api.state.time>=5);const once=api.state.total;api.inject();assert(api.state.total>=once);
 const controls=panel.shadowRoot;controls.getElementById('back').onclick();assert(panel.hidden);
 now=6000;intervals.at(-1)();assert.equal(api.state.time,6);assert(api.state.total>=once);
 view.onclick();assert.equal(panel.hidden,false);assert.equal(api.state.time,6);
 controls.getElementById('pause').onclick();const paused={...api.state};
 now=15000;intervals.at(-1)();assert.equal(api.state.time,paused.time);assert.equal(api.state.total,paused.total);
 controls.getElementById('pause').onclick();controls.getElementById('speed').onchange({target:{value:'10'}});
 now=16000;intervals.at(-1)();assert.equal(api.state.time,16);
 controls.getElementById('finish').onclick();const finished={...api.state};now=17000;intervals.at(-1)();assert.equal(api.state.total,finished.total);assert.equal(api.state.time,finished.time);
 // A completed acquisition stays viewable; a new injection starts afresh.
 controls.getElementById('back').onclick();view.onclick();assert.equal(api.state.total,finished.total);assert(api.state.finished);
 vm.runInContext('physical.prone=true;declared.prone=true;',ctx);api.inject();assert.equal(api.state.detector,1);assert.equal(api.state.time,0);
 assert.equal(elements.get('mag3Screen'),panel,'Duplicate acquisition panels');
 now=18000;intervals.at(-1)();assert.equal(api.state.time,1);
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('type="module"')&&!m[1].includes('application/json'));
 for(const script of scripts)new vm.Script(script[2]);
 assert(html.includes(fs.readFileSync(path.join(root,'scripts/mag3_acquisition.js'),'utf8').replace(/\r\n/g,'\n').trim()),'Embedded engine is stale');
 const report={result:'OK',data:'Basal only, 20 min, two arm poses, 36 angles',
   accumulation:'All pixels; movement preserves previous counts; no counts in empty field; extra-renal acquisition verified',
   dynamic_frames:84,frame_sum_equals_total:true,poisson_expected_agreement:true,
   embedded_screen_no_popup:true,hide_keeps_acquiring:true,reopen_preserves_counts:true,repeat_button_does_not_reset:true,selected_posterior_detector:2,
   pause_speed_finish:true,prone_selects_detector_1:true,inline_scripts_parse:true,embedded_engine_current:true,
   browser_ui:'Not exercised: offline numerical/runtime test with mocked DOM'};
 fs.writeFileSync(path.join(root,'assets/icrp145/mag3-verificacion.json'),JSON.stringify(report,null,2));
 assert(!errors.length,String(errors));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

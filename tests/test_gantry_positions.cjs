const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={},context=vm.createContext({window,document:{getElementById:()=>null}});
for(const file of ['gantry_setups','gantry_collision','gantry_positions'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),context);
const {presets,nextState}=window.GANTRY_POSITION_CORE,C=window.GANTRY_COLLISION_CORE;
assert.equal(presets.length,10);
const boxes=[{min:[-.28,0,-.36],max:[.28,.24,.36]}];
const range={detDist1:[12,50],detDist2:[12,50]},limits=()=>({d1:20,d2:28});
for(const preset of presets){
  let G={setup:preset.setup,rot:90,detectorSeparation:180,detDist1:50,detDist2:50,tableH:80,tableZ:200};
  for(const phase of ['retract','rotate',...preset.park?[]:['approach']]){
    let done=false;
    for(let i=0;i<500&&!done;i++){
      const step=nextState(G,preset,phase,.05,limits,range);done=step.done;
      assert(C.detectorGap(step.next,boxes,boxes)>=C.MARGIN,'No head-to-head collision: '+preset.id);
      assert.equal(step.next.tableZ,200);assert.equal(step.next.tableH,80);G=step.next;
    }
    assert(done,'Preset must reach its endpoint: '+preset.id);
  }
  assert(Math.abs(G.rot-preset.rot)<1e-7);assert.equal(G.detectorSeparation,preset.separation);
}
const from={rot:0,detectorSeparation:180,detDist1:30,detDist2:30,tableH:90,tableZ:200};
const evaluate=s=>[1,2].map(()=>({body:{gap:1},table:{gap:1},equipment:{gap:C.detectorGap(s,boxes,boxes),region:'other detector'}}));
const collision=C.sweep(from,{...from,detectorSeparation:76},evaluate);
assert(collision.blocked);assert.equal(collision.blocked.surface,'equipment');
assert(collision.state.detectorSeparation>76,'Sweep must inspect separation changes between endpoints');
// D2 patient geometry must rotate independently, not remain opposite D1.
const mesh=C.indexed(C.boxTriangles([-.1,.9,.15],[.1,1.1,.25],'test'));
const physical={feetX0:0,travel:0,iso:1,length:1.75,bodyH:.3,tail:-2,headFirst:false,prone:false};
const a=C.query(mesh,boxes,{...from,tableH:0},2,physical);
const b=C.query(mesh,boxes,{...from,tableH:0,detectorSeparation:90},2,physical);
assert.notEqual(a.body.required,b.body.required);
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('target.n===2 ? (G.detectorSeparation??180) : 0'));
assert(html.includes('th + (st.detectorSeparation??180)*Math.PI/180'));
const S=window.GANTRY_SETUP;
assert.deepEqual(Array.from(presets,p=>p.id),['lateral','standing1','standing2','external','ct','ap','90a','90p','76a','76p']);
for(const id of ['standing1','standing2']){
 const G={...from,setup:id,rot:90,detDist1:50,detDist2:50},layout=S.geometry(G),n=id==='standing1'?1:2;
 assert(layout.standing);assert.equal(layout.table,null);
 assert(layout.heads[n-1].outward);assert(!layout.heads[2-n].outward);
 assert(layout.world([-1.75,0,0])[1]>layout.world([0,0,0])[1]+1.7,'Patient must be upright');
 assert(!S.signal(G,n).empty);assert(S.signal(G,3-n).empty);
 const patient=C.indexed(C.boxTriangles([-1.75,0,-.15],[0,.30,.15],'patient'));
 const collision=C.query(patient,boxes,G,n,{bodyH:.30});
 assert(Math.abs(collision.body.gap-.02)<1e-8,'Standing patient 2 cm from outer face');
 assert.equal(collision.table.gap,Infinity,'No phantom collision with hidden equipment bed');
}
const external={...from,setup:'external',rot:0,detectorSeparation:0,detDist1:40,detDist2:40};
const ext=S.geometry(external);assert(ext.table);assert.equal(ext.heads[0].angle,0);assert.equal(ext.heads[1].angle,0);
assert(ext.heads[1].position[0]-ext.heads[0].position[0]>.56);
assert(C.detectorGap(external,boxes,boxes)>.10);
assert(S.signal(external,1).progress<S.signal(external,2).progress,'Two successive source fields along the body');
const ct={...from,setup:'ct',rot:90,detDist1:50,detDist2:50};
const ctLayout=S.geometry(ct);assert(Math.abs(ctLayout.feet-1.75/2-.60)<1e-8);
assert(S.signal(ct,1).empty&&S.signal(ct,2).empty);
assert(ctLayout.heads.every(h=>h.position[0]+.28<ctLayout.feet-1.75));
assert(S.signal({...from,setupTransition:true},1).empty);
assert.equal(S.signal(external,1,{prone:true}).angle,180);
assert(Math.abs(S.signal(external,1,{headFirst:true}).progress+S.signal(external,1).progress-1)<1e-8);
// Actual menu controller: complete normal/standing/external/CT transitions,
// restore the initial bed and roll back an interrupted patient relocation.
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},append(){},addEventListener(){}});return elements.get(id);}
let now=0,callback=null;
const G={...from,detDist1:25,detDist2:30,tableH:90,tableZ:205,arms:'down'};
const patient=C.indexed(C.boxTriangles([-1.75,0,-.15],[0,.30,.15],'patient'));
const phys={iso:1.03,length:1.75,bodyH:.30,travel:1.75/.92,feetX0:-.08*1.75/.92,tail:-1.43};
const hits=g=>{
 const pair=[1,2].map(n=>C.query(patient,boxes,g,n,phys));
 pair.forEach(h=>h.equipment={gap:C.detectorGap(g,boxes,boxes),region:'other detector'});return pair;
};
window.GANTRY={G,LIM:range,render(){window.GANTRY_AUTO?.sync();}};
window.GANTRY3D={collision:{ready:true,evaluate:hits,guard:(a,b)=>C.sweep(a,b,hits)},
 limits:g=>{const h=hits(g);return {d1:Math.ceil(h[0].limit*100),d2:Math.ceil(h[1].limit*100)};},setupLayout:()=>S.geometry(G,phys)};
const ui=vm.createContext({window,document:{hidden:false,getElementById:el,createElement:()=>el('panel'),addEventListener(){}},
 performance:{now:()=>now},setInterval:fn=>{callback=fn;return 1;},clearInterval:()=>{callback=null;}});
vm.runInContext(fs.readFileSync('scripts/gantry_positions.js','utf8'),ui);
const run=()=>{for(let i=0;window.GANTRY_AUTO.busy&&i<1200;i++){now+=50;callback();}assert(!window.GANTRY_AUTO.busy);};
for(const id of ['standing1','standing2','external','ct','ap','90a','76p']){
 assert(window.GANTRY_AUTO.start(id));run();
 const p=presets.find(p=>p.id===id);assert.equal(G.setup,p.setup,id+': '+el('gantryPositionStatus').textContent);
 assert.equal(G.setupTransition,false);assert.equal(G.detectorSeparation,p.separation);assert(Math.abs(((G.rot-p.rot+540)%360)-180)<1e-8);
 assert(hits(G).every(h=>Math.min(h.body.gap,h.table.gap,h.equipment.gap)>=.0024));
}
assert.equal(G.tableH,90);assert.equal(G.tableZ,205);
const original=JSON.stringify(G);assert(window.GANTRY_AUTO.start('standing1'));now+=50;callback();window.GANTRY_AUTO.stop();
assert.equal(G.setup,'normal');assert.equal(G.setupTransition,false);assert.equal(G.tableZ,205);assert.equal(G.rot,142);
window.GANTRY_BONE_ACQ={active:true};assert(!window.GANTRY_AUTO.start('ct'));assert.equal(G.setup,'normal');
console.log('OK: exact 1-10 order, standing exterior heads and signal, external stretcher with successive downward fields, CT excluded from SPECT and safe detector spacing.');

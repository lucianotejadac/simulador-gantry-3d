const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={},context=vm.createContext({window,document:{getElementById:()=>null}});
for(const file of ['gantry_collision','gantry_positions'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),context);
const {presets,nextState}=window.GANTRY_POSITION_CORE,C=window.GANTRY_COLLISION_CORE;
assert.equal(presets.length,10);
const boxes=[{min:[-.28,0,-.36],max:[.28,.24,.36]}];
const range={detDist1:[12,50],detDist2:[12,50]},limits=()=>({d1:20,d2:28});
for(const preset of presets){
  let G={rot:0,detectorSeparation:180,detDist1:25,detDist2:30,tableH:90,tableZ:200};
  for(const phase of ['retract','rotate',...preset.park?[]:['approach']]){
    let done=false;
    for(let i=0;i<500&&!done;i++){
      const step=nextState(G,preset,phase,.05,limits,range);done=step.done;
      assert(C.detectorGap(step.next,boxes,boxes)>=C.MARGIN,'No head-to-head collision: '+preset.id);
      assert.equal(step.next.tableZ,200);assert.equal(step.next.tableH,90);G=step.next;
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
console.log('OK: 10 preset endpoints, bounded motion, unchanged bed, independent D2 geometry and swept head-to-head collision protection.');

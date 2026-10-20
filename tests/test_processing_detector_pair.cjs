const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function state(id,series,total){
  return {dataset:{string:key=>({x00110010:'GANTRY_SIMULATION',x00080018:'uid'+id,x0020000e:series,x00200013:String(id),x0008103e:'Detector '+id,
    x00111010:JSON.stringify({simulation:true,detector:id,elapsed:id*60,stoppedEarly:false})}[key])},
    pixels:new Float64Array([total]),frameCount:1,frameSize:1};
}
const one=state(1,'scan',5892),two=state(2,'scan',4830),other=state(3,'other',99999);
const nodes={'frame-0':{value:'0'},'frame-1':{value:''},'detector-0':{},'detector-1':{}};
for(const n of Object.values(nodes)){n.replaceChildren=()=>{};n.append=()=>{};}
const seen=[];
const stats=[{},{}];
for(let i=0;i<2;i++)nodes['stats-'+i]={querySelectorAll:()=>[{querySelector:tag=>tag==='label'?{textContent:i===0?'T. restante':'T. transcurrido'}:stats[i]}]};
const ctx=vm.createContext({window:{},dataset:one.dataset,pixels:one.pixels,frameCount:1,frameSize:1,currentMode:'whole',
  acquisitionInstances:{whole:{one,two,other}},$:id=>nodes[id],value:(ds,key)=>ds.string('x'+key),document:{createElement:()=>({})},
  buildPanels(){nodes['frame-0'].value='0';nodes['frame-1'].value='';},
  selectMode(){ctx.buildPanels();nodes['frame-1'].value='';},
  render(i){seen.push({i,uid:ctx.dataset.string('x00080018'),total:ctx.pixels[Number(nodes['frame-'+i].value)],frame:nodes['frame-'+i].value});}});
vm.runInContext(fs.readFileSync('scripts/processing_recorded_metadata.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('scripts/processing_detector_pair.js','utf8'),ctx);
ctx.buildPanels();ctx.render(0);ctx.render(1);
assert.deepEqual(seen.map(x=>x.total),[5892,4830]);
assert.deepEqual(seen.map(x=>x.uid),['uid1','uid2']);
assert(seen.every(x=>x.frame==='0'));
assert.equal(ctx.dataset,one.dataset);assert.equal(ctx.pixels,one.pixels);
assert.equal(nodes['frame-1'].value,'1');
assert.equal(nodes['detector-1'].textContent,'Detector 2');
assert.equal(stats[0].textContent,'0 s · finalizada');assert.equal(stats[1].textContent,'120 s');
// Restoring the second detector as the selected series instance still shows D1/D2.
ctx.dataset=two.dataset;ctx.pixels=two.pixels;ctx.buildPanels();ctx.render(0);ctx.render(1);
assert.deepEqual(seen.slice(-2).map(x=>x.total),[5892,4830]);
assert.equal(ctx.dataset,two.dataset);assert.equal(ctx.pixels,two.pixels);
nodes['frame-1'].value='0';ctx.render(1);assert.equal(stats[1].textContent,'60 s','Switching viewport uses selected image duration');
assert.equal(one.pixels[0],5892);assert.equal(two.pixels[0],4830);
ctx.selectMode();
assert.equal(nodes['frame-1'].value,'1','Restored single-instance view must reveal its newly received companion');
assert.equal(seen.at(-1).total,4830);
console.log('OK: paired detector instances render their own original counts, remain isolated across series, and restore viewer context.');

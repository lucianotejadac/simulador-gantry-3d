const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const jobs=[],nodes=new Map();
function canvas(){
 const c={_width:256,_height:256,resets:0,clears:0,draws:0,pixels:[123]};
 for(const axis of ['width','height'])Object.defineProperty(c,axis,{get(){return c['_'+axis];},set(v){c['_'+axis]=v;c.resets++;c.pixels=[];}});
 c.getContext=()=>({save(){},restore(){},setTransform(){},fillText(){},
  fillRect(){c.clears++;c.pixels=[];},clearRect(){c.clears++;c.pixels=[];},
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData(im){c.pixels=Array.from(im.data);},drawImage(src){c.draws++;c.pixels=src.pixels.slice();}});
 c.setAttribute=()=>{};return c;
}
const document={readyState:'loading',addEventListener(){},querySelectorAll:()=>[],createElement:()=>canvas(),
 getElementById(id){if(id==='boneAcqControls')return null;if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',classList:{toggle(){}},setAttribute(){}});return nodes.get(id);}};
const el=id=>document.getElementById(id);
el('boneAcqCriterion').value='time';el('boneAcqTarget').value='60';
const live={signal:{mode:'final'},settings:{study:'dmsa',matrix:256},ready:true};
const ctx=vm.createContext({window:{GANTRY_LIVE:live},document,Float32Array,Float64Array,Uint32Array,
 setTimeout(fn,delay){const job={fn,delay,canceled:false};jobs.push(job);return job;},clearTimeout(job){if(job)job.canceled=true;}});
vm.runInContext(fs.readFileSync('scripts/bone_acquisition.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('scripts/final_preview.js','utf8'),ctx);
const P=ctx.window.GANTRY_FINAL_PREVIEW;
const targets=[1,2].map(n=>({n,canvas:canvas(),buffer:canvas(),info:{},linearField:{values:Float32Array.from([1,2,3,4]),sum:10}}));
const state=(rot,distance)=>({state:{rot},d1:{effectiveDistance:distance},d2:{effectiveDistance:distance+1}});
const sync=(s=state(0,12))=>P.sync('dmsa',targets,2000000,s);
const pending=()=>jobs.filter(j=>!j.canceled&&!j.ran);
async function finish(job=pending().at(-1)){job.ran=true;await job.fn();}
const snapshots=()=>targets.map(t=>({pixels:t.canvas.pixels.slice(),caption:t.info.textContent,draws:t.canvas.draws}));
(async()=>{
 sync();assert(targets.every(t=>t.canvas.pixels[0]===123),'initial calculation retains the visible frame');
 await finish();const first=snapshots();assert(first.every(s=>s.pixels.some(v=>v>0)&&s.draws===1));
 sync(state(15,54));assert.deepEqual(snapshots(),first,'rotation keeps both completed images and their original distance labels');
 const stale=pending().at(-1);
 live.settings.matrix=128;sync(state(20,60));
 await finish(stale);assert.deepEqual(snapshots(),first,'superseded async result cannot replace a newer request');
 await finish();const second=snapshots();assert(second.every(s=>s.draws===2));assert(second[0].caption.includes('60.0 cm'));
 sync(state(20,60));assert.deepEqual(snapshots(),second,'unchanged updates do not repaint or regenerate noise');
 live.ready=false;sync(state(30,70));assert.deepEqual(snapshots(),second,'loading a new atlas keeps the last complete preview');
 live.ready=true;el('finalPreviewTarget').value='';sync(state(30,70));await finish();
 assert.deepEqual(snapshots(),second,'temporarily invalid input does not blank the image');
 assert(el('finalPreviewStatus').textContent.includes('Objetivo'));
 el('finalPreviewTarget').value='60';sync(state(30,70));await finish();assert(targets.every(t=>t.canvas.draws===3));
 // Production live renderer must also leave the display untouched while loading.
 const html=fs.readFileSync('index.html','utf8');
 const start=html.indexOf('  function renderDetector(target, G){'),end=html.indexOf('\n  function update(G){',start);
 Object.assign(ctx,{acquisition:{study:'dmsa',matrix:256},ready:false});
 vm.runInContext(html.slice(start,end),ctx);
 const before=snapshots();for(const t of targets)ctx.renderDetector(t,{});
 assert.deepEqual(snapshots(),before,'live rendering uses an offscreen target in final mode');
 assert(targets.every(t=>t.canvas.resets===0&&t.canvas.clears===0),'visible canvases never resized or cleared between previews');
 live.signal.mode='live';P.controls();
 ctx.renderDetector(targets[0],{});assert(targets[0].canvas.resets>0,'live mode regains its original canvas');
 console.log('OK: final preview preserves both frames during rotation, matrix/parameter changes, loading and errors; ignores stale results; isolates live rendering; updates captions atomically.');
})().catch(e=>{console.error(e);process.exitCode=1;});

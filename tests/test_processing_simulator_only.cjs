const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('processing/index.html','utf8');
assert(!/<input\b[^>]*type=["']file["']/i.test(html),'no external file pickers');
for(const id of ['open','open-folder','open-project','open-demo','open-tutorial']){
 assert(!new RegExp('id="'+id+'"').test(html),`no external action ${id}`);
}
assert(!html.includes('loadFiles([...e.dataTransfer.files])'));
assert(!html.includes('Carga un DICOM'));
assert(!html.includes('const demoCase='));
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
const nodes=new Map(),calls=[],bar={append:n=>nodes.set(n.id,n)};
const node=()=>({children:[],setAttribute(){},append(n){this.children.push(n);}});
nodes.set('save-project',{textContent:'Guardar proyecto',click:()=>calls.push('save')});
const env={document:{querySelector:()=>bar,createElement:node,getElementById:id=>nodes.get(id)},
 status:s=>calls.push(s),loadFile:async(file,parsed)=>{calls.push('receive');return parsed;}};
vm.runInNewContext(fs.readFileSync('scripts/processing_compact.js','utf8'),env);
(async()=>{
 const menu=nodes.get('processingFileMenu');
 assert.deepEqual(menu.children.map(o=>o.value),['save-project','help','flex']);
 await assert.rejects(()=>env.loadFile({name:'external.dcm'}),/simulador/);
 await assert.rejects(()=>env.loadFile({}, {string:()=> 'EXTERNAL'}),/simulador/);
 assert.equal(calls.length,0);
 const parsed={string:()=> 'GANTRY_SIMULATION'};assert.equal(await env.loadFile({},parsed),parsed);
 menu.value='save-project';menu.onchange();assert.equal(calls.at(-1),'save');
 menu.value='help';menu.onchange();assert.match(calls.at(-1),/Adquirir/);
 console.log('OK: no file/folder/project/demo import UI, no drop import, simulator-only loader, export retained and packaged JavaScript parses.');
})().catch(e=>{console.error(e);process.exitCode=1;});

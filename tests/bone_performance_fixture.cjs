// Exercise the production atlas and electronics, without downloads or WebGL in timings.
const fs=require('node:fs'),vm=require('node:vm');
const assetFetch=require('./asset_fetch.cjs');
const html=fs.readFileSync('index.html','utf8');
async function fixture(sources={},physical=true){
  const window={GANTRY_MDP_DATA:JSON.parse(html.match(/window.GANTRY_MDP_DATA=(.*?);<\/script>/)[1]),
    GANTRY_ICRP_DATA:JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\r?\n/)[1])};
  const ctx=vm.createContext({window,document:{getElementById:()=>null},Math,
    Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Blob,Response,DecompressionStream,fetch:assetFetch});
  window.GANTRY_CAMERA_DATA=JSON.parse(fs.readFileSync('assets/physics/siemens-recovered-equipment.json','utf8'));
  for(const name of [...(physical?['camera_response']:[]),'icrp_live','mdp'])vm.runInContext(sources[name]||fs.readFileSync('scripts/'+name+'.js','utf8'),ctx);
  const constants=['COUNT_REFERENCE','DIST_REFERENCE_CM','COUNT_DECAY','BLUR_AT_CONTACT','BLUR_PER_CM'].map(name=>html.match(new RegExp('const '+name+' = .*?;'))[0]).join('\n');
  const studies=html.slice(html.indexOf('  const studies={'),html.indexOf('  let ready = false;'));
  const electronics=html.slice(html.indexOf('  const collimatorProfiles='),html.indexOf('  function segmentAt('));
  vm.runInContext('const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));\n'+constants+studies+electronics+'\nwindow.metrics=distanceMetrics;',ctx);
  await window.GANTRY_MDP.load('up');
  return window;
}
function project(W,{n=256,energy=140,width=20,col='LEHR',distance=15,angle=0,move=0,seconds=7200,cache={}}={}){
  const M=W.GANTRY_MDP,p=M.geometry('up'),cropSize=560/(p.pixelMm||3);
  const crop={x:p.width/2-cropSize/2,y:p.headRow+180+move-cropSize/2,w:cropSize,h:cropSize};
  const metrics=W.metrics(distance,'bone',col,energy,width);
  return M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},crop,n,n,false,false,metrics,metrics.blur*n/240,'up',cache,seconds);
}
module.exports={fixture,project};

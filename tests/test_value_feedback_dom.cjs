// Live monitors are siblings of the acquisition panel, not its descendants.
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM(`<section id="gantryLive"><input id="liveEnergyCenter" type="number" value="140"></section>
  <section id="gantryLiveMonitors"><div id="liveCameraSettings">140 keV</div>
    <div id="liveInfoD1">100 cuentas</div><div id="liveInfoD2">200 cuentas</div></section>
  <section id="rfPanel"><input id="rfDose" type="number" min="0.001" step="any" required value="20"></section>`,{runScripts:'outside-only'});
const w=dom.window,$=id=>w.document.getElementById(id);let now=0,tick;
w.GANTRY_LIVE={settings:{study:'bone'},signal:{mode:'live',duration:.75},ready:true};
Object.defineProperty(w.performance,'now',{value:()=>now});
w.setTimeout=fn=>{tick=fn;return 1;};w.clearTimeout=()=>{};
w.eval(fs.readFileSync('scripts/value_feedback.js','utf8'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event(id.startsWith('rf')?'change':'input',{bubbles:true}));};
const mark=(id,direction)=>$(id).querySelector('.value-change-'+direction);
(async()=>{
  await flush();
  $('liveInfoD1').textContent='102 cuentas';await flush();
  assert(!mark('liveInfoD1','pending'),'Ordinary live noise is not a parameter change');
  change('liveEnergyCenter','180');
  $('liveCameraSettings').textContent='180 keV';$('liveInfoD1').textContent='0 cuentas';await flush();
  assert(mark('liveInfoD1','pending'),'Separate live monitor observes persistence reset');
  assert(mark('liveCameraSettings','pending'),'Active camera numbers use the same symbolism');
  now=1100;$('liveInfoD1').textContent='20 cuentas';await flush();tick();
  now=1700;tick();await flush();
  assert(mark('liveInfoD1','decrease'),'Lower settled count displays downward hollow arrow class');
  assert(mark('liveCameraSettings','increase'),'Higher energy displays upward filled arrow class');
  assert(!$('liveInfoD2').querySelector('.value-change-flash'),'Unchanged detector readout is not highlighted');
  now=4300;$('liveInfoD1').textContent='21 cuentas';await flush();
  assert(!$('liveInfoD1').querySelector('.value-change-flash'),'Arrow expires without being retriggered by noise');
  change('rfDose','40');$('liveInfoD1').textContent='42 cuentas';await flush();
  assert(mark('liveInfoD1','pending'),'New RF panel triggers live feedback');
  now=5400;tick();now=6000;tick();await flush();
  assert(mark('liveInfoD1','increase'));
  now=8700;$('liveInfoD1').textContent='43 cuentas';await flush();
  change('rfDose','');$('liveInfoD1').textContent='44 cuentas';await flush();
  assert(!$('liveInfoD1').querySelector('.value-change-flash'),'Incomplete manual input must not highlight unrelated noise');
  dom.window.close();console.log('OK: separate monitor roots, camera summary, pending and directional markers, RF inputs, unchanged values and noise suppression.');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});

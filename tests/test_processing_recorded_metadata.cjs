const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const env=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('scripts/processing_recorded_metadata.js','utf8'),env);
const {fields,timing}=env.window.GANTRY_RECORDED_METADATA;
const info={simulation:true,detector:1,elapsed:90,stoppedEarly:false,
 acquisition:{mode:'counts',target:400000,names:['Anterior','Posterior']},
 heads:[{detector:1,elapsed:90},{detector:2,elapsed:121}],
 settings:{decubitus:'prone',headFirst:true},
 processing:{uniformityApplied:false,stopRule:'independent',first:{
 settings:{decubitus:'supine',headFirst:false},geometry:{detectorSeparation:180},
 detectors:[{rawAngle:0},{rawAngle:180}]}}};
const f=fields(info,2);
assert.equal(f['Posición del cuerpo'],'Supino','Use acquisition start, not later settings');
assert.equal(f['Orientación'],'Cabeza fuera · pies dentro');
assert.equal(f['Imagen 2'],'Posterior');
assert.equal(f['Ángulo inicial'],'180°');
assert.equal(fields({...info,processing:{first:{detectors:[{rawAngle:315},{rawAngle:45}]}}})['Configuración de detector'],'90°');
assert.equal(f['Duración real'],'121 s','Detector-specific duration');
assert.equal(f['Conteos de paro (Kcts)'],'400');
assert.equal(f['Tiempo programado'],'No aplica');
assert.match(f['Corrección de uniformidad'],/No aplicada/);
assert.equal(timing(info).remaining,'0 s · finalizada');
assert.equal(timing({...info,elapsed:0}).elapsed,'0 s');
assert.equal(timing({...info,stoppedEarly:true}).remaining,'Interrumpida');
assert.equal(timing({...info,stoppedEarly:true,acquisition:{mode:'time',target:120}}).remaining,'30 s · interrumpida');
assert.equal(timing({...info,stoppedEarly:undefined}).remaining,undefined);
assert.equal(fields({...info,processing:undefined})['Corrección de uniformidad'],'No registrada');
assert.equal(fields({...info,scan:{contours:'fixed'}})['Contornos automáticos'],'Desactivados · distancia fija');
assert.equal(fields({...info,processing:{...info.processing,varied:true}})['Posición del cuerpo'],'Supino · al inicio');
assert.equal(fields({}).Orientación,undefined);
assert.equal(timing({}),null);
console.log('OK: recorded positions, per-detector durations, zero, early stop, legacy unknowns and no live-gantry fallback.');

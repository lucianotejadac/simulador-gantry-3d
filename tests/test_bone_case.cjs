const fs=require('node:fs'),assert=require('node:assert/strict'),{fixture}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),M=W.GANTRY_MDP;
 W.GANTRY_BONE_CASE_DATA=JSON.parse(fs.readFileSync('assets/physics/bone-case.json','utf8'));
 W.GANTRY_PATIENT={id:'phantom'};await M.loadCase();
 const results=[];
 for(const pose of ['down','up']){
  await M.load(pose);const p=M.geometry(pose);
  for(const angle of [0,45,90,180,270]){
   await M.ensureAngles(pose,[angle]);const cache={},metrics=W.metrics(15,'bone','LEHR',140,20);
   const crop={x:p.width/2-80,y:p.headRow+(350-84.492155)*2,w:160,h:100};
   const field=t=>M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},crop,160,100,false,false,metrics,1,pose,cache,t);
   for(const seconds of [0,15,150,7200]){
    W.GANTRY_PATIENT.id='phantom';const normal=field(seconds);
    W.GANTRY_PATIENT.id='caso-oseo';const lesion=field(seconds);
    assert(lesion.values.every(x=>Number.isFinite(x)&&x>=0));
    assert.deepEqual(M.mix(lesion.mdpBases,seconds).values,lesion.values,'acquisition and live share the same lesion');
    if(seconds===0)assert.deepEqual(normal.values,lesion.values,'no lesion before tracer arrival');
    else assert(lesion.sum>normal.sum,'increased regional uptake in all three phases');
    results.push({pose,angle,seconds,ratio:lesion.sum/normal.sum});
    if(process.env.BONE_CASE_PREVIEW&&pose==='down'&&[0,180].includes(angle)&&seconds>0)
      fs.writeFileSync(process.env.BONE_CASE_PREVIEW+`/case-${angle}-${seconds}.json`,JSON.stringify({width:160,height:100,values:Array.from(lesion.values)}));
    W.GANTRY_PATIENT.id='phantom';assert.deepEqual(field(seconds).values,normal.values,'switching back restores baseline and invalidates cache');
   }
  }
 }
 console.log('OK: both arm poses, five angles, three phases, live/acquisition parity, baseline restored.');
 console.log(JSON.stringify(results.filter(r=>r.pose==='down'&&[0,180].includes(r.angle))));
})().catch(e=>{console.error(e);process.exitCode=1;});

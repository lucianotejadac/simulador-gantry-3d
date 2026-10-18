// node tests/benchmark_bone_energy.cjs [--baseline] [output.json]
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {fixture,project}=require('./bone_performance_fixture.cjs');
(async()=>{
  const baseline=process.argv.includes('--baseline'),sources={};
  if(baseline)for(const name of ['icrp_live','mdp'])sources[name]=execFileSync('git',['show','4049011:scripts/'+name+'.js'],{encoding:'utf8'});
  const W=await fixture(sources),cases=[];
  for(const n of [128,256])for(const energy of [80,120,140,200,450])for(const col of ['LEHR','MELP','HE'])cases.push({n,energy,width:20,col});
  for(const width of [10,15,25])for(const energy of [120,140])for(const col of ['LEHR','MELP','HE'])cases.push({n:256,energy,width,col});
  project(W,{n:256,energy:80}); // JIT warm-up; all atlas decoding was awaited above.
  const results=[];
  for(const c of cases){
    const caches=[{},{}],times=[];let cps=0;
    for(let move=0;move<3;move++){
      const begin=performance.now();
      for(let head=0;head<2;head++){
        const f=project(W,{...c,move:move*2,angle:head*180,distance:head?30:5,cache:caches[head]});
        cps=f.sum*W.GANTRY_MDP.rate/2000000;
      }
      times.push(performance.now()-begin);
    }
    results.push({...c,ms:+times.sort((a,b)=>a-b)[1].toFixed(2),posteriorCps:+cps.toFixed(4)});
  }
  const report={baseline,scope:'Median CPU ms for two detector fields after a table move; decoded ICRP atlas, 120 min MDP, excludes browser painting/WebGL/network',node:process.version,results};
  const output=process.argv.find(a=>a.endsWith('.json'));if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.table(results.filter(c=>c.n===256&&c.width===20));
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const assetFetch=require('./asset_fetch.cjs');
const html=fs.readFileSync('index.html','utf8');
assert(Buffer.byteLength(html)<1_100_000,'HTML must stay small');
assert(!/base64,[A-Za-z0-9+/=]{10000}/.test(html),'No large inline assets');
const packed=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const calls=[];let fail=false;
const ctx=vm.createContext({window:{GANTRY_ICRP_DATA:packed},Blob,Response,DecompressionStream,Uint8Array,Uint16Array,Float32Array,Float64Array,atob,
 fetch:async url=>{calls.push(url);return fail?new Response('',{status:503}):assetFetch(url);}});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),ctx);
(async()=>{
 const api=ctx.window.GANTRY_ICRP;
 assert.equal(calls.length,0,'Loading runtime must not download a study');
 const a=api.load('up'),b=api.load('up');assert.equal(a,b);
 await a;assert.deepEqual(calls,[packed.up.url]);assert.deepEqual(Object.keys(api.poses),['up']);
 await api.load('up');assert.equal(calls.length,1,'Reuse a loaded pose');
 fail=true;await assert.rejects(api.load('mibi_up'));assert(!api.poses.mibi_up);
 fail=false;await api.load('mibi_up');assert(api.poses.mibi_up);assert(!api.poses.down);
 // Compare each external byte stream with the previously published inline page.
 const {execFileSync}=require('node:child_process');
 const before=execFileSync('git',['show','20c55e4:index.html'],{maxBuffer:70_000_000}).toString();
 const oldIcrp=JSON.parse(before.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
 for(const name of Object.keys(oldIcrp))assert(fs.readFileSync(packed[name].url).equals(Buffer.from(oldIcrp[name].deflate,'base64')));
 const mag3=JSON.parse(html.match(/window.GANTRY_MAG3_DATA=(.*?);\n/)[1]);
 const oldMag3=JSON.parse(before.match(/window.GANTRY_MAG3_DATA=(.*?);\n/)[1]);
 for(const name of ['down','up'])assert(fs.readFileSync(mag3.urls[name]).equals(Buffer.from(oldMag3.packed[name],'base64')));
 assert.deepEqual(JSON.parse(fs.readFileSync(mag3.integralUrl,'utf8')),oldMag3.integral);
 for(const name of fs.readdirSync('assets/runtime')){
   const hash=crypto.createHash('sha256').update(fs.readFileSync('assets/runtime/'+name)).digest('hex').slice(0,16);
   assert(name.includes('.'+hash+'.'),'Cache URL must reflect content: '+name);
 }
 console.log('OK: small HTML, lazy per-pose downloads, concurrent deduplication, memory reuse, failure/retry, byte-exact ICRP/MAG3 and cache fingerprints.');
})().catch(error=>{console.error(error);process.exitCode=1;});

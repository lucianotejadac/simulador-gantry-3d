const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const assetFetch=require('./asset_fetch.cjs');
const html=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(html.match(/window.GANTRY_ASSET_PARTS=(.*?);\n/)[1]);
const source=fs.readFileSync('scripts/asset_transport.js','utf8');
assert(Buffer.byteLength(html)<350000,'Keep the HTML shell small');
assert(html.includes(source.trim()),'Transport embedded in page is current');
for(const [url,parts] of Object.entries(manifest)){
  const bytes=parts.map(([part,size])=>{const b=fs.readFileSync(part);assert.equal(b.length,size);assert(size<=524288);return b;});
  assert(Buffer.concat(bytes).equals(fs.readFileSync(url)),'Lossless parts: '+url);
}
const urls=Object.keys(manifest),calls=[];let active=0,peak=0,fail=null,truncate=null;
const context=vm.createContext({window:{GANTRY_ASSET_PARTS:manifest},Response,ReadableStream,Uint8Array,
  fetch:async(url,options)=>{
    assert.equal(options.cache,'force-cache');calls.push(url);active++;peak=Math.max(peak,active);
    try{
      await new Promise(resolve=>setTimeout(resolve,2));
      if(url===fail)return new Response('',{status:503});
      if(url===truncate)return new Response(new Uint8Array(1));
      return await assetFetch(url);
    }finally{active--;}
  }});
vm.runInContext(source,context);
const download=async url=>Buffer.from(await (await context.window.GANTRY_ASSETS.fetch(url)).arrayBuffer());
(async()=>{
  assert.equal(calls.length,0,'No eager study downloads');
  const [a,b,c]=await Promise.all([download(urls[0]),download(urls[0]),download(urls[1])]);
  assert(a.equals(b));assert(a.equals(fs.readFileSync(urls[0])));assert(c.equals(fs.readFileSync(urls[1])));
  assert(peak>1&&peak<=4,'Bound parallel requests across concurrent studies');
  assert.equal(calls.length,new Set([...manifest[urls[0]],...manifest[urls[1]]].map(p=>p[0])).size,'Deduplicate concurrent chunks');
  fail=manifest[urls[0]][0][0];await assert.rejects(download(urls[0]),/503/);
  fail=null;assert((await download(urls[0])).equals(a),'Retry after HTTP failure');
  truncate=manifest[urls[0]][0][0];await assert.rejects(download(urls[0]),/incompleta/);
  truncate=null;assert((await download(urls[0])).equals(a),'Retry after truncated response');
  const fallback='assets/runtime/symbia-room.40a36f2a15b3e0bc.bin';
  assert((await download(fallback)).equals(fs.readFileSync(fallback)),'Unsplit assets still load');
  // Exercise the actual streaming decompressor with the partitioned transport.
  const icrp=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
  Object.assign(context,{Blob,DecompressionStream,Uint16Array,Float32Array,Float64Array,atob});
  context.window.GANTRY_ICRP_DATA=icrp;
  vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),context);
  const pose=await context.window.GANTRY_ICRP.load('thyroid');
  const raw=require('node:zlib').inflateSync(fs.readFileSync(icrp.thyroid.url));
  assert(Buffer.from(pose.frames[0].buffer).equals(raw),'Streaming decode is byte exact');
  console.log('OK: small HTML, all atlas bytes preserved, parallel limit, cache reuse, deduplication, retries and streaming decode.');
})().catch(error=>{console.error(error);process.exitCode=1;});

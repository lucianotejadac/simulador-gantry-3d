// Filesystem-backed HTTP response substitute for numerical tests (no browser).
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
module.exports=async function assetFetch(url){
  if(!/^assets\/runtime\/[\w.-]+$/.test(url))throw Error('Unexpected asset URL: '+url);
  try{return new Response(await fs.readFile(path.join(root,url)));}
  catch(error){if(error.code==='ENOENT')return new Response('',{status:404});throw error;}
};

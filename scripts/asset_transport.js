/* Immutable, content-addressed assets. Keep downloads bounded across studies. */
(function(){
  'use strict';
  const manifest=window.GANTRY_ASSET_PARTS||{},pending=new Map(),queue=[];
  let active=0;
  function pump(){
    while(active<4&&queue.length){
      const job=queue.shift();active++;
      job.run().then(job.resolve,job.reject).finally(()=>{active--;pump();});
    }
  }
  function part(entry){
    const [url,size]=entry;
    if(!pending.has(url)){
      const promise=new Promise((resolve,reject)=>{
        queue.push({resolve,reject,async run(){
          const response=await fetch(url,{cache:'force-cache'});
          if(!response.ok)throw Error('No se pudo descargar el atlas ('+response.status+')');
          const bytes=new Uint8Array(await response.arrayBuffer());
          if(bytes.length!==size)throw Error('Descarga de atlas incompleta');
          return bytes;
        }});pump();
      });
      pending.set(url,promise);
      promise.then(()=>pending.delete(url),()=>pending.delete(url));
    }
    return pending.get(url);
  }
  function download(url){
    const entries=manifest[url];
    if(!entries)return fetch(url,{cache:'force-cache'});
    const jobs=entries.map(part);
    // A later part can fail before the stream reaches it.
    jobs.forEach(job=>job.catch(()=>{}));
    return Promise.resolve(new Response(new ReadableStream({async start(controller){
      try{for(const job of jobs)controller.enqueue(await job);controller.close();}
      catch(error){controller.error(error);}
    }})));
  }
  window.GANTRY_ASSETS={fetch:download};
})();

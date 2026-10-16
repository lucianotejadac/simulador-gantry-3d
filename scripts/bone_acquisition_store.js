/* Local, origin-scoped snapshots. Counts and catalogue commit atomically. */
(function(){
  'use strict';
  function snapshot(session,names,settings,now=Date.now(),id=crypto.randomUUID()){
    return {version:1,id,createdAt:now,n:session.n,height:session.height||session.n,kind:session.kind||'static',mode:session.mode,target:session.target,
      study:session.study||settings.study||'bone',finished:session.finished,names:names.slice(),settings:structuredClone({...settings,...(session.administeredActivity?{administeredActivity:session.administeredActivity}:{})}),
      ...(session.administeredActivity?{administeredActivity:structuredClone(session.administeredActivity)}:{}),
      ...(session.mdpStart?{mdp:{start:structuredClone(session.mdpStart),end:structuredClone(session.mdpEnd||session.mdpStart),limit:!!session.mdpLimit}}:{}),
      ...(session.mibiStart?{mibi:{start:structuredClone(session.mibiStart),end:structuredClone(session.mibiEnd||session.mibiStart),limit:!!session.mibiLimit}}:{}),
      ...(session.mode==='scan'?{scan:{velocity:session.velocity,travel:session.travel,startZ:session.startZ,endZ:session.endZ,phase:session.phase,initialGeometry:structuredClone(session.initialGeometry)}}:{}),
      heads:session.heads.map(h=>({detector:h.detector,total:h.total,elapsed:h.elapsed,done:h.done,counts:h.counts.slice()}))};
  }
  function validate(record){
    if(!record||record.version!==1||typeof record.id!=='string'||!Number.isFinite(record.createdAt)||
      ![128,256].includes(record.n)||!['counts','time','scan'].includes(record.mode)||!Number.isFinite(record.target)||(record.mode==='scan'?record.target<=0:record.target<1)||
      !Array.isArray(record.names)||record.names.length!==2||record.names.some(n=>typeof n!=='string'||!n.trim()||n.length>80)||
      !Array.isArray(record.heads)||record.heads.length!==2)throw Error('Adquisición guardada no válida');
    const height=record.height??record.n,kind=record.kind??'static';
    if(record.mode==='scan'&&(kind!=='whole'||!record.scan||!Number.isFinite(record.scan.velocity)||record.scan.velocity<1||record.scan.velocity>60||!Number.isFinite(record.scan.travel)||record.scan.travel<0||record.scan.travel>record.target))throw Error('Datos de barrido no válidos');
    if(!Number.isInteger(height)||height<record.n||height>record.n*6||!['static','whole'].includes(kind)||
      (kind==='static'&&height!==record.n))throw Error('Formato de imagen no válido');
    record.heads.forEach((h,i)=>{
      if(h.detector!==i+1||!(h.counts instanceof Uint32Array)||h.counts.length!==record.n*height||
        !Number.isFinite(h.elapsed)||h.elapsed<0||!Number.isSafeInteger(h.total)||h.total<0||h.counts.reduce((a,b)=>a+b,0)!==h.total)
        throw Error('Datos de cuentas incompletos');
    });
    return record;
  }
  function createStore(indexedDB){
    let opening;
    function open(){
      if(!opening)opening=new Promise((resolve,reject)=>{
        if(!indexedDB){reject(Error('Almacenamiento local no disponible'));return;}
        const request=indexedDB.open('gantry-bone-acquisitions',1);
        request.onupgradeneeded=()=>{
          const db=request.result;
          for(const name of ['records','catalog'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
        };
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(Error('Cierra las otras pestañas del simulador y vuelve a intentar'));
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      }).catch(error=>{opening=null;throw error;});
      return opening;
    }
    async function transaction(stores,mode,work){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(stores,mode);let result;
        tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('No se pudo guardar en este navegador'));
        tx.onerror=()=>{};
        try{work(tx,value=>{result=value;});}catch(error){tx.abort();reject(error);}
      });
    }
    return {
      async save(record){
        validate(record);
        const {heads,settings,...meta}=record;
        return transaction(['records','catalog'],'readwrite',tx=>{
          tx.objectStore('records').put(record);
          tx.objectStore('catalog').put({...meta,totals:heads.map(h=>h.total)});
        });
      },
      async list(){return transaction(['catalog'],'readonly',(tx,set)=>{const r=tx.objectStore('catalog').getAll();r.onsuccess=()=>set(r.result.sort((a,b)=>b.createdAt-a.createdAt));});},
      async get(id){const record=await transaction(['records'],'readonly',(tx,set)=>{const r=tx.objectStore('records').get(id);r.onsuccess=()=>set(r.result);});return validate(record);}
    };
  }
  window.GANTRY_BONE_STORAGE={snapshot,validate,createStore};
})();

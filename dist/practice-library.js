/* Device-local imports and playback of prepared partitions. */
(function(root){'use strict';let opening,bundledPromise;
function open(){if(!opening)opening=new Promise((resolve,reject)=>{if(!root.indexedDB)return reject(Error('Le stockage local est indisponible.'));const request=indexedDB.open('de-vive-voix-library',1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('scores',{keyPath:'id'});db.createObjectStore('audio',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Impossible d’ouvrir la bibliothèque locale.'));});return opening;}
async function operation(store,mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=action(tx.objectStore(store));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(Error('Impossible de conserver les fichiers sur cet appareil.'));tx.onabort=()=>reject(Error('La sauvegarde locale a été interrompue.'));});}
const get=(store,id)=>operation(store,'readonly',s=>s.get(id)),put=(store,value)=>operation(store,'readwrite',s=>s.put(value));
async function bundled(){
 if(!bundledPromise)bundledPromise=fetch('scores/index.json').then(r=>{if(!r.ok)throw Error('Catalogue des morceaux fournis indisponible.');return r.json();}).then(data=>data.scores||[]).catch(error=>{bundledPromise=null;throw error;});
 return bundledPromise;
}
async function list(){
 const results=await Promise.allSettled([bundled(),operation('scores','readonly',s=>s.getAll())]);
 if(results.every(r=>r.status==='rejected'))throw results[1].reason;
 const supplied=results[0].status==='fulfilled'?results[0].value:[],local=results[1].status==='fulfilled'?results[1].value:[];
 const localIds=new Set(local.map(record=>record.id));
 return [...new Map([...local.map(record=>({...record,local:true,bundled:false})),...supplied.map(record=>({...record,local:localIds.has(record.id),bundled:true}))].map(record=>[record.id,record])).values()];
}
function audioIds(record){return new Set(Object.values(record.verses||{}).flatMap(verse=>Object.values(verse.assets||{}).flat().map(asset=>asset.cacheId).filter(Boolean)));}
async function remove(id,expectedRecord){
 const db=await open();
 const removed=await new Promise((resolve,reject)=>{
  const tx=db.transaction(['scores','audio'],'readwrite'),scores=tx.objectStore('scores'),request=scores.getAll();let found=false;
  request.onsuccess=()=>{
   const records=request.result,record=records.find(record=>record.id===id);if(!record)return;
   if(expectedRecord&&JSON.stringify(record)!==JSON.stringify(expectedRecord))return;
   found=true;const shared=new Set(records.filter(record=>record.id!==id).flatMap(record=>[...audioIds(record)]));
   scores.delete(id);const audio=tx.objectStore('audio');for(const key of audioIds(record))if(!shared.has(key))audio.delete(key);
  };
  tx.oncomplete=()=>resolve(found);
  tx.onerror=tx.onabort=()=>reject(Error('Impossible de supprimer cette partition de cet appareil.'));
 });
 if(removed&&!expectedRecord)try{const prefix='de-vive-voix:practice:v1:'+id+':';for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(prefix))localStorage.removeItem(key);}}catch{}
 return removed;
}
async function loadBundle(id,verse){
 const cloudEnabled=root.CloudLibrary?.cutover;
 const supplied=cloudEnabled?null:(await bundled().catch(()=>[])).find(record=>record.id===id);
 let record;
 if(supplied){
  const response=await fetch(supplied.bundleUrl,{cache:'no-cache'});
  if(!response.ok)throw Error('Impossible de charger ce morceau fourni.');
  record=await response.json();
 }else{
  record=await get('scores',id).catch(error=>{if(!cloudEnabled)throw error;return null;});
  if(!record&&cloudEnabled){
   const cloud=await root.CloudLibrary.getRecord(id);
   if(!cloud)throw Error('Cette partition est absente de ta bibliothèque.');
   if(cloud.record.pilot)return {record:cloud.record,score:cloud.record.score,assets:await playbackAssets(cloud.record.assets,cloud)};
   return bundleFor(cloud.record,verse,cloud);
  }
  if(!record)throw Error('Ce morceau n’est pas présent sur cet appareil. Réimportez son fichier.');
  if(record.audioRateWpm!==175){
   const engine=new ImportSpeech.Engine();
   try{
    const prepared=await ImportSpeech.prepare(record.score,record.score.language||'la',{engine});
    record={...record,...prepared};await put('scores',record);
   }finally{engine.close();}
  }
 }
 return bundleFor(record,verse);
}
async function playbackAssets(input,cloud){
 const assets={},urls=new Map();
 try{
  for(const [key,list] of Object.entries(input)){
   assets[key]=[];
   for(const asset of list){
    const checksum=asset.stored||cloud?.record.cloudAudio?.[asset.cacheId],reference=checksum||asset.cacheId;
    if(!reference){assets[key].push({...asset});continue;}
    if(!urls.has(reference)){
     const blob=checksum?await cloud.readAudio(checksum):(await get('audio',asset.cacheId))?.blob;
     if(!blob)throw Error('Un son local a disparu. Réimportez le morceau.');
     urls.set(reference,URL.createObjectURL(blob));
    }
    assets[key].push({...asset,url:urls.get(reference)});
   }
  }
  return assets;
 }catch(error){for(const url of urls.values())URL.revokeObjectURL(url);throw error;}
}
async function bundleFor(record,verse,cloud){
 const data=record.verses[verse||record.score.verseNumbers[0]];
 if(!data)throw Error('Couplet absent.');
 return {record,score:record.score,language:data.language||record.score.language,map:data.map,continuations:data.continuations,assets:await playbackAssets(data.assets,cloud)};
}
root.PracticeLibrary={open,getAudio:id=>get('audio',id),putAudio:value=>put('audio',value),save:value=>put('scores',value),list,listLocal:()=>operation('scores','readonly',s=>s.getAll()),loadBundle,remove};if(typeof module!=='undefined')module.exports=root.PracticeLibrary;
})(globalThis);


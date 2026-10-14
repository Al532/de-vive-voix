/* Bundled public scores plus device-local imports. User imports stay on the device. */
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
 return [...new Map([...local,...supplied].map(record=>[record.id,record])).values()];
}
async function loadBundle(id,verse){
 const supplied=(await bundled().catch(()=>[])).find(record=>record.id===id);
 let record;
 if(supplied){const response=await fetch(supplied.bundleUrl,{cache:'no-cache'});if(!response.ok)throw Error('Impossible de charger ce morceau fourni.');record=await response.json();}
 else record=await get('scores',id);if(!record)throw Error('Ce morceau n’est pas présent sur cet appareil. Réimportez son fichier.');if(!supplied&&record.audioRateWpm!==175){const engine=new ImportSpeech.Engine();try{const prepared=await ImportSpeech.prepare(record.score,record.score.language||'la',{engine});record={...record,...prepared};await put('scores',record);}finally{engine.close();}}const data=record.verses[verse||record.score.verseNumbers[0]];if(!data)throw Error('Couplet absent.');const assets={};for(const [key,list] of Object.entries(data.assets)){assets[key]=[];for(const asset of list){if(asset.cacheId){const cached=await get('audio',asset.cacheId);if(!cached)throw Error('Un son local a disparu. Réimportez le morceau.');assets[key].push({...asset,url:URL.createObjectURL(cached.blob)});}else assets[key].push({...asset});}}return {record,score:record.score,language:data.language||record.score.language,map:data.map,continuations:data.continuations,assets};}
root.PracticeLibrary={open,getAudio:id=>get('audio',id),putAudio:value=>put('audio',value),save:value=>put('scores',value),list,loadBundle};if(typeof module!=='undefined')module.exports=root.PracticeLibrary;
})(globalThis);

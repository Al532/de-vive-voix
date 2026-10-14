'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const model=require('./dist/blocs.js'),planner=require('./dist/bloc-speech.js'),navigation=require('./dist/score-navigation.js');
const speech=require('./dist/import-speech.js');assert.equal(speech.latinCode('r'),'R');assert.equal(speech.latinCode('ɡlorja'),'gloRja');
const manifest=JSON.parse(fs.readFileSync('dist/scores/index.json','utf8'));
for(const entry of manifest.scores){
 const record=JSON.parse(fs.readFileSync('dist/'+entry.bundleUrl,'utf8')),bytes=fs.readFileSync('dist/'+entry.sourceUrl);
 assert.equal(record.sourceSha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(record.id,entry.id);assert.equal(record.score.title,entry.score.title);
 assert.equal(record.score.starts.length-1,16);assert.equal(record.score.parts.length,7);assert.equal(record.score.parts.filter(p=>p.vocal).length,5);
 for(const [verse,data]of Object.entries(record.verses)){
  assert(!Object.keys(data.assets).some(key=>key.includes('r/')),'Latin r must use the rolled phoneme');
  assert.equal(Object.keys(data.assets).filter(key=>key.includes('R')).length,6,'all six Exaudi r syllables must be regenerated');
  const score=structuredClone(record.score);score.continuationMap=data.continuations;
  for(const [part,p]of score.parts.entries()){
   if(!p.vocal)continue;
   for(const size of [1,2,8])for(const block of model.buildBlocs(score,part,{measures:size}))for(const tempo of [30,80,160]){
    const range=model.withLeadIn(score,part,block,true),cues=planner.plan(score,part,range,tempo,data.map);
    for(const cue of cues){
     assert(data.assets[cue.ipa]?.length,'Missing prepared syllable');
     for(const asset of data.assets[cue.ipa]){assert.equal(data.audioRateWpm,175);assert.equal(asset.rateWpm,175);assert(!asset.cacheId);assert(asset.duration>0&&Number.isFinite(asset.gain));assert(fs.existsSync('dist/'+asset.url));}
    }
   }
  }
 }
}
function mount({storage=true,catalogue=true,legacy=false}={}){
 const entry=manifest.scores[0],local={id:'local-piece',filename:'local.mxl',audioRateWpm:175,score:{title:'Morceau personnel',verseNumbers:['1'],language:'fr'},verses:{1:{map:[{}],continuations:[{}],assets:{a:[{cacheId:'local-audio'}]}}}};
 if(legacy)delete local.audioRateWpm;const migration={prepared:0,closed:0};
 const stores={scores:new Map([[local.id,local],[entry.id,{...local,id:entry.id}]]),audio:new Map([['local-audio',{blob:'local-blob'}]])};
 const db={transaction(store){const tx={objectStore(){return {put(value){stores[store].set(value.id,value);const req={result:value.id};queueMicrotask(()=>tx.oncomplete());return req;},get(id){const req={result:stores[store].get(id)};queueMicrotask(()=>tx.oncomplete());return req;},getAll(){const req={result:[...stores[store].values()]};queueMicrotask(()=>tx.oncomplete());return req;}};}};return tx;}};
 const sandbox={console,fetch:async url=>{if(!catalogue)throw Error('offline');const file='dist/'+url;return {ok:fs.existsSync(file),json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};},URL:{createObjectURL:()=> 'blob:local-audio'}};
 sandbox.ImportSpeech={Engine:class{close(){migration.closed++;}},prepare:async score=>{migration.prepared++;return {score,audioRateWpm:175,verses:{1:{language:'fr',map:[{}],continuations:[{}],assets:{a:[{cacheId:'local-audio',rateWpm:175}]}}}};}};
 if(storage)sandbox.indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req;}};
 vm.runInNewContext(fs.readFileSync('dist/practice-library.js','utf8'),sandbox);
 return Object.assign(sandbox.PracticeLibrary,{migration});
}
(async()=>{
 const entry=manifest.scores[0],library=mount(),records=await library.list();
 assert.equal(records.filter(r=>r.id===entry.id).length,1,'Provided and identical local score must not appear twice');
 assert(records.some(r=>r.id==='local-piece'));
 assert(navigation.entries(records,{title:'Pilote'}).some(r=>r.id===entry.id&&r.title==='Exaudi nos — Jean Gilles'));
 const supplied=await library.loadBundle(entry.id);assert.equal(supplied.score.title,'Exaudi nos');assert.equal(supplied.language,'la');
 const local=await library.loadBundle('local-piece');assert.equal(local.assets.a[0].url,'blob:local-audio');
 const noStorage=mount({storage:false});assert.equal((await noStorage.list()).length,manifest.scores.length);assert.equal((await noStorage.loadBundle(entry.id)).score.title,'Exaudi nos');
 const old=mount({legacy:true}),migrated=await old.loadBundle('local-piece');assert.equal(migrated.record.audioRateWpm,175);assert.equal(old.migration.prepared,1);assert.equal(old.migration.closed,1);await old.loadBundle('local-piece');assert.equal(old.migration.prepared,1,'migration must persist and only run once');
 const offline=mount({catalogue:false});assert((await offline.list()).some(r=>r.id==='local-piece'));assert.equal((await offline.loadBundle('local-piece')).score.title,'Morceau personnel');
 console.log('Exaudi nos : source exacte, 16 mesures, 7 parties, 5 voix, syllabes de tous les blocs, menu sans doublon, imports locaux et absence de stockage vérifiés.');
})().catch(e=>{console.error(e);process.exitCode=1;});

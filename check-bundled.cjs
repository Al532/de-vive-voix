'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const model=require('./dist/blocs.js'),planner=require('./dist/bloc-speech.js'),navigation=require('./dist/score-navigation.js');
const speech=require('./dist/import-speech.js');assert.equal(speech.latinCode('r'),'R');assert.equal(speech.latinCode('ɡlorja'),'gloRja');
const manifest=JSON.parse(fs.readFileSync('dist/scores/index.json','utf8'));
for(const entry of manifest.scores){
 const record=JSON.parse(fs.readFileSync('dist/'+entry.bundleUrl,'utf8')),bytes=fs.readFileSync('dist/'+entry.sourceUrl);
 assert.equal(record.sourceSha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(record.id,entry.id);assert.equal(record.score.title,entry.score.title);
 const campra=entry.score.title==='Omnes gentes';
 assert.equal(record.score.starts.length-1,campra?25:16);assert.equal(record.score.parts.length,campra?3:7);assert.equal(record.score.parts.filter(p=>p.vocal).length,campra?2:5);
 if(campra){assert.equal(record.score.composer,'André Campra');assert.deepEqual(record.score.parts.map(p=>p.name),['Soprano','Basse','Orgue']);assert.equal(record.score.warnings.length,0);}
 for(const [verse,data]of Object.entries(record.verses)){
  assert(!Object.keys(data.assets).some(key=>key.includes('r/')),'Latin r must use the rolled phoneme');
  if(!campra)assert.equal(Object.keys(data.assets).filter(key=>key.includes('R')).length,6,'all six Exaudi r syllables must be regenerated');
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
 const stores={scores:new Map([[local.id,local],[entry.id,{...structuredClone(local),id:entry.id}]]),audio:new Map([['local-audio',{blob:'local-blob'}]])};
 const settings=new Map([['de-vive-voix:practice:v1:local-piece:position','saved'],['de-vive-voix:practice:v1:other-piece:position','other']]);
 const db={transaction(names){let pending=0;const tx={objectStore(name){const store=name||names;function request(action){const req={};pending++;queueMicrotask(()=>{req.result=action();req.onsuccess?.();if(--pending===0)queueMicrotask(()=>{if(pending===0)tx.oncomplete?.();});});return req;}return {put:value=>request(()=>{stores[store].set(value.id,value);return value.id;}),get:id=>request(()=>stores[store].get(id)),getAll:()=>request(()=>[...stores[store].values()]),delete:id=>request(()=>stores[store].delete(id))};}};return tx;}};
 const sandbox={console,fetch:async url=>{if(!catalogue)throw Error('offline');const file='dist/'+url;return {ok:fs.existsSync(file),json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};},URL:{createObjectURL:()=> 'blob:local-audio'}};
 sandbox.ImportSpeech={Engine:class{close(){migration.closed++;}},prepare:async score=>{migration.prepared++;return {score,audioRateWpm:175,verses:{1:{language:'fr',map:[{}],continuations:[{}],assets:{a:[{cacheId:'local-audio',rateWpm:175}]}}}};}};
 sandbox.localStorage={get length(){return settings.size;},key:i=>[...settings.keys()][i],removeItem:key=>settings.delete(key)};
 if(storage)sandbox.indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req;}};
 vm.runInNewContext(fs.readFileSync('dist/practice-library.js','utf8'),sandbox);
 return Object.assign(sandbox.PracticeLibrary,{migration,stores,settings});
}
(async()=>{
 const entry=manifest.scores[0],library=mount(),records=await library.list();
 assert.equal(records.filter(r=>r.id===entry.id).length,1,'Provided and identical local score must not appear twice');
 assert(records.some(r=>r.id==='local-piece'));
 assert.equal(records.find(r=>r.id==='local-piece').local,true);assert.equal(records.find(r=>r.id===entry.id).local,false);
 const campra=manifest.scores.find(r=>r.score.title==='Omnes gentes');assert(campra,'Campra must be provided in the catalogue');
 const campraBundle=await library.loadBundle(campra.id);assert.equal(campraBundle.score.parts.length,3);assert.equal(campraBundle.score.parts.filter(p=>p.vocal).length,2);
 assert(navigation.entries(records,{title:'Pilote'}).some(r=>r.id===entry.id&&r.title==='Exaudi nos — Jean Gilles'));
 const supplied=await library.loadBundle(entry.id);assert.equal(supplied.score.title,'Exaudi nos');assert.equal(supplied.language,'la');
 const local=await library.loadBundle('local-piece');assert.equal(local.assets.a[0].url,'blob:local-audio');
 const noStorage=mount({storage:false});assert.equal((await noStorage.list()).length,manifest.scores.length);assert.equal((await noStorage.loadBundle(entry.id)).score.title,'Exaudi nos');
 const old=mount({legacy:true}),migrated=await old.loadBundle('local-piece');assert.equal(migrated.record.audioRateWpm,175);assert.equal(old.migration.prepared,1);assert.equal(old.migration.closed,1);await old.loadBundle('local-piece');assert.equal(old.migration.prepared,1,'migration must persist and only run once');
 const offline=mount({catalogue:false});assert((await offline.list()).some(r=>r.id==='local-piece'));assert.equal((await offline.loadBundle('local-piece')).score.title,'Morceau personnel');
 const deletion=mount();deletion.stores.audio.set('exclusive-audio',{blob:'exclusive'});deletion.stores.scores.get('local-piece').verses[1].assets.a.push({cacheId:'exclusive-audio'});
 assert.equal(await deletion.remove('local-piece'),true);assert(!deletion.stores.scores.has('local-piece'));assert(deletion.stores.audio.has('local-audio'),'shared audio must survive');assert(!deletion.stores.audio.has('exclusive-audio'));
 assert(!deletion.settings.has('de-vive-voix:practice:v1:local-piece:position'));assert(deletion.settings.has('de-vive-voix:practice:v1:other-piece:position'));
 assert.equal(await deletion.remove('local-piece'),false);assert((await deletion.list()).some(r=>r.id===entry.id),'bundled score must survive local deletion');
 assert.equal(await deletion.remove(entry.id),true);assert(!deletion.stores.audio.has('local-audio'),'unreferenced audio must be deleted');assert.equal((await deletion.loadBundle(entry.id)).score.title,'Exaudi nos');
 await assert.rejects(()=>noStorage.remove('local-piece'),/stockage local/);
 console.log('Exaudi nos et Campra : sources, parties, mesures, syllabes, catalogue, imports, suppression locale et conservation des sons partagés vérifiés.');
})().catch(e=>{console.error(e);process.exitCode=1;});

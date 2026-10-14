import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.DOMParser=require('./tools/testing/xmldom').DOMParser;
globalThis.fflate=require('./dist/vendor/fflate.js');
globalThis.MusicXMLImport=require('./dist/musicxml-import.js');
globalThis.LatinPhonetics=require('./dist/phonetics-engine.js');
const speech=require('./dist/import-speech.js');
const {phonemizeBatch,synthesizeMnemonics}=await import('./dist/vendor/espeak-adapter.js');
const [source,language='la']=process.argv.slice(2);
if(!source)throw Error('Usage: node --expose-gc prepare-bundled-score.mjs dist/scores/<piece>/<file.mxl> [language]');
const directory=path.dirname(source),urlDirectory=path.relative('dist',directory).split(path.sep).join('/');
assert(!urlDirectory.startsWith('..'));
const audioDirectory=path.join(directory,'audio');fs.mkdirSync(audioDirectory,{recursive:true});
const bytes=fs.readFileSync(source),sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex'),filename=path.basename(source);
const score=await MusicXMLImport.read({name:filename,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const assets=new Map();
globalThis.PracticeLibrary={getAudio:async id=>assets.get(id),putAudio:async value=>assets.set(value.id,value)};
globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join('dist',url),'utf8'))};}catch{return {ok:false};}};
const wasmBinary=new Uint8Array(fs.readFileSync('dist/vendor/espeak-ng.wasm'));
let jobs=0;
const engine={async run(task){
 const result=task.kind==='phonemes'?await phonemizeBatch(task.entries,task.voice,{wasmBinary}):await synthesizeMnemonics(task.code,task.voice,{wasmBinary,rate:task.rate});
 if(++jobs%4===0)globalThis.gc?.();
 return result;
}};
const prepared=await speech.prepare(score,language,{engine,progress:text=>{if(text.startsWith('Préparation des sons')&&Number(text.match(/(\d+) sur/)?.[1])%20===0)console.log(text);}});
let written=0,extraBytes=0;
for(const data of Object.values(prepared.verses))for(const list of Object.values(data.assets))for(const asset of list){
 if(!asset.cacheId)continue;
 const cached=assets.get(asset.cacheId);assert(cached?.blob);
 const name=crypto.createHash('sha256').update(asset.cacheId).digest('hex').slice(0,24)+'.wav',file=path.join(audioDirectory,name);
 if(!fs.existsSync(file)){const audio=Buffer.from(await cached.blob.arrayBuffer());fs.writeFileSync(file,audio);written++;extraBytes+=audio.length;}
 asset.url=urlDirectory+'/audio/'+name;delete asset.cacheId;
}
const id=sourceSha256+'-'+language;
const record={id,filename,sourceSha256,sourceUrl:urlDirectory+'/'+filename,...prepared};
fs.writeFileSync(path.join(directory,'bundle.json'),JSON.stringify(record));
const indexFile='dist/scores/index.json',index=fs.existsSync(indexFile)?JSON.parse(fs.readFileSync(indexFile,'utf8')):{version:1,scores:[]};
index.scores=index.scores.filter(item=>item.id!==id);
index.scores.push({id,filename,score:{title:score.title,composer:score.composer},bundleUrl:urlDirectory+'/bundle.json',sourceUrl:record.sourceUrl});
fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify({id,title:score.title,composer:score.composer,measures:score.starts.length-1,parts:score.parts.map(p=>({name:p.name,vocal:p.vocal})),verses:score.verseNumbers,warnings:score.warnings,stats:prepared.stats,additionalAudioFiles:written,additionalAudioBytes:extraBytes}));

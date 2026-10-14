import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),speech=require('./dist/import-speech.js');const {synthesizeText,synthesizeMnemonics,phonemize}=await import('./dist/vendor/espeak-adapter.js'),wasmBinary=new Uint8Array(fs.readFileSync('dist/vendor/espeak-ng.wasm'));
const result=[];for(const [voice,text]of [['it','Levati sol'],['fr-fr','Dans un sommeil que charmait ton image']]){const wav=speech.analyseWav(await synthesizeText(text,voice,{wasmBinary}));assert(wav.duration>.2&&wav.gain>0);result.push({voice,duration:wav.duration,validLocalWav:true});}console.log(JSON.stringify({ok:true,naturalText:result}));
const bundle=require('./dist/scores/exaudi-nos/bundle.json'),rolled=[];
for(const [key,assets]of Object.entries(bundle.verses['1'].assets).filter(([key])=>key.includes('R'))){
 const code=key.slice(3),trace=await phonemize(`[[${code}]]`,'it',{wasmBinary});
 assert.equal((trace.match(/R/g)||[]).length,(code.match(/R/g)||[]).length,'the embedded engine must recognize every rolled R');
 for(const asset of assets){
  const rate=asset.speed===1?145:450,wav=speech.analyseWav(await synthesizeMnemonics(code,'it',{wasmBinary,rate}));
  assert.deepEqual(Buffer.from(wav.bytes),fs.readFileSync('dist/'+asset.url),'published recording must match rolled-R synthesis');
 }
 rolled.push(code);
}
assert.equal(rolled.length,6);console.log(JSON.stringify({ok:true,rolledRSyllables:rolled,verifiedRecordings:12}));

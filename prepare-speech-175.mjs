import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {synthesizeMnemonics} from './dist/vendor/espeak-adapter.js';
const require=createRequire(import.meta.url),{analyseWav,latinCode}=require('./dist/import-speech.js');
const bench=require('./dist/tempo-bench-audio.json'),entries=Object.values(bench.assets).map(a=>({...a,voice:'it'}));
const bundle=require('./dist/scores/exaudi-nos/bundle.json');bundle.audioRateWpm=175;
for(const data of Object.values(bundle.verses)){data.audioRateWpm=175;for(const key of Object.keys(data.assets))data.assets[key]=[bench.assets[key]];}
fs.writeFileSync('dist/scores/exaudi-nos/bundle.json',JSON.stringify(bundle));
const pilot=require('./dist/bloc-speech-audio.json'),wasmBinary=new Uint8Array(fs.readFileSync('dist/vendor/espeak-ng.wasm'));
fs.mkdirSync('dist/speech-audio-175',{recursive:true});
for(const ipa of Object.keys(pilot)){
 const code=latinCode(ipa);let asset=entries.find(a=>a.code===code&&a.voice==='it');
 if(!asset){const wav=analyseWav(await synthesizeMnemonics(code,'it',{wasmBinary,rate:175})),id=crypto.createHash('sha256').update('espeak-1.52dev|it|175|'+code).digest('hex').slice(0,24),url='speech-audio-175/'+id+'.wav';fs.writeFileSync('dist/'+url,wav.bytes);asset={url,duration:wav.duration,gain:wav.gain,speed:1,rateWpm:175,code,voice:'it'};entries.push(asset);}
 pilot[ipa]=[asset];globalThis.gc?.();
}
fs.writeFileSync('dist/bloc-speech-audio.json',JSON.stringify(pilot,null,2)+'\n');
fs.writeFileSync('dist/speech-audio-175.json',JSON.stringify({rateWpm:175,engine:bench.engine,entries},null,2)+'\n');
console.log(JSON.stringify({pilot:Object.keys(pilot).length,exaudi:Object.keys(bench.assets).length,shared:entries.length}));

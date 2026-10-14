import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {synthesizeMnemonics} from './dist/vendor/espeak-adapter.js';
const require=createRequire(import.meta.url),{analyseWav}=require('./dist/import-speech.js');
const bundle=require('./dist/scores/exaudi-nos/bundle.json'),wasmBinary=new Uint8Array(fs.readFileSync('dist/vendor/espeak-ng.wasm'));
const assets={},directory='dist/tempo-bench-audio';fs.mkdirSync(directory,{recursive:true});
for(const key of Object.keys(bundle.verses['1'].assets)){
 const code=key.slice(3),wav=analyseWav(await synthesizeMnemonics(code,'it',{wasmBinary,rate:175}));
 const id=crypto.createHash('sha256').update('espeak-1.52dev|it|175|'+code).digest('hex').slice(0,24);
 const url='tempo-bench-audio/'+id+'.wav';fs.writeFileSync('dist/'+url,wav.bytes);
 assets[key]={url,duration:wav.duration,gain:wav.gain,speed:1,rateWpm:175,code};
 console.log('Préparé',code);globalThis.gc?.();
}
fs.writeFileSync('dist/tempo-bench-audio.json',JSON.stringify({engine:'eSpeak NG 1.52-dev WebAssembly',voice:'it',rateWpm:175,score:'Exaudi nos — Jean Gilles',assets},null,2)+'\n');
console.log('Banc de test :',Object.keys(assets).length,'sons à 175 mots/minute.');

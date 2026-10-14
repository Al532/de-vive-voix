import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {plan,stretchMono} from './dist/tempo-stretch.mjs';
const require=createRequire(import.meta.url),manifest=require('./dist/tempo-bench-audio.json');
function readWav(bytes){
 const raw=Buffer.from(bytes);let rate,channels,bits,pcm;
 for(let at=12;at+8<=raw.length;){const size=raw.readUInt32LE(at+4),tag=raw.toString('ascii',at,at+4);if(tag==='fmt '){channels=raw.readUInt16LE(at+10);rate=raw.readUInt32LE(at+12);bits=raw.readUInt16LE(at+22);}if(tag==='data')pcm=raw.subarray(at+8,at+8+size);at+=8+size+(size%2);}
 assert.equal(channels,1);assert.equal(bits,16);const samples=Float32Array.from({length:pcm.length/2},(_,i)=>pcm.readInt16LE(i*2)/32768);return {samples,rate};
}
assert.equal(manifest.rateWpm,175);assert.equal(Object.keys(manifest.assets).length,29);
assert.equal(plan(.4,.3,1.5).ratio,.4/.3);assert.equal(plan(.4,.1,1.5).ratio,1.5);assert.equal(plan(.1,.3,1.5).ratio,1);
assert.equal(plan(.8,.1,6).ratio,6);
for(const sr of [22050,48000])for(const ratio of [1,1.05,1.25,1.5,2,3,4,6]){
 const seconds=ratio>3?2:.5,samples=Float32Array.from({length:sr*seconds},(_,i)=>.2*Math.sin(i*2*Math.PI*200/sr)),output=stretchMono(samples,sr,ratio);
 if(ratio===1)assert.deepEqual(output,samples);
 // At high compression the final WSOLA grain can extend past the target;
 // keep that audible tail (as the bench reports) rather than truncate it.
 assert(Math.abs(output.length/sr-seconds/ratio)<(ratio>3?.045:.025));
 const first=Math.round(sr*.035),last=output.length-Math.round(sr*.035);let crossings=0;
 for(let i=first+1;i<last;i++)if(output[i-1]<=0&&output[i]>0)crossings++;
 const frequency=crossings*sr/(last-first);assert(Math.abs(frequency-200)<8,'time-stretch must preserve a 200 Hz tone, not raise pitch with speed');
}
for(const [key,asset]of Object.entries(manifest.assets)){
 assert.equal(asset.rateWpm,175);const {samples,rate}=readWav(fs.readFileSync('dist/'+asset.url));assert(Math.abs(samples.length/rate-asset.duration)<1e-6);
 for(const profile of ['short','medium','long'])for(const ratio of [1.25,1.5,2,3,4,6]){
  const output=stretchMono(samples,rate,ratio,profile);assert(output.every(Number.isFinite));assert(output.some(v=>Math.abs(v)>.003));
  assert(output.length>=Math.ceil(samples.length/ratio),'a processing tail may be kept, never clip to a shorter slot');
 }
}
// Exercise the actual page controller, decode real WAVs and schedule real transport cues.
function element(kind='element'){
 const nodes=[],classes=new Set();return {kind,value:'',textContent:'',checked:false,disabled:false,dataset:{},attrs:{},handlers:{},
 get children(){return nodes.filter(n=>n.kind!=='text');},append(...items){nodes.push(...items);},replaceChildren(...items){nodes.length=0;nodes.push(...items);},
 classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;},play(){return Promise.resolve();},pause(){}};
}
const els=Object.fromEntries([...fs.readFileSync('dist/tempo-bench.html','utf8').matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,element()]));
for(const [id,value]of Object.entries({tempo:'80',cap:'1.5',profile:'medium',passage:'second'}))els[id].value=value;els.notes.checked=true;
globalThis.document={hidden:false,getElementById:id=>els[id],createElement:()=>element(),createTextNode:text=>({...element('text'),textContent:text}),addEventListener(){}};
const sources=[];function audioBuffer(length,rate,pcm=new Float32Array(length)){return {length,sampleRate:rate,duration:length/rate,getChannelData:()=>pcm};}
class AudioContext{
 constructor(){this.sampleRate=22050;this.currentTime=0;this.state='running';this.destination={};AudioContext.latest=this;}
 resume(){return Promise.resolve();}createBuffer(channels,length,rate){return audioBuffer(length,rate);}
 decodeAudioData(bytes){const {samples,rate}=readWav(bytes);return Promise.resolve(audioBuffer(samples.length,rate,samples));}
 createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
 createBufferSource(){const node={connect(){},disconnect(){},start(time=0,offset=0,duration){Object.assign(this,{time,offset,duration});sources.push(this);},stop(){this.stopped=true;this.onended?.();}};return node;}
}
globalThis.window={AudioContext,navigator:{},addEventListener(){}};
globalThis.BlocModel=require('./dist/blocs.js');globalThis.BlocSpeech=require('./dist/bloc-speech.js');globalThis.PracticeTransport=require('./dist/transport.js');
globalThis.NoteSynth={schedule(context,pitch,time,duration){return {kind:'tone',pitch,time,duration,stop(){}};}};
globalThis.fetch=async url=>{const bytes=fs.readFileSync('dist/'+url);return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};};
const bench=await import('./dist/tempo-bench.mjs');await bench.ready;assert.equal(els.rows.children.length,4);assert.equal(els.rSamples.children.length,6);
await bench.play('stretch');let state=bench.getState();assert.equal(state.playback,'playing');assert(state.rows.some(r=>r.ratio>1));assert(state.rows.every(r=>r.ratio<=1.5));
AudioContext.latest.currentTime=.2;await new Promise(resolve=>setTimeout(resolve,35));
const syllables=sources.filter(n=>n.buffer?.length>1);assert(syllables.length>0);assert(syllables.every(n=>n.duration===undefined),'play whole processed buffers');
bench.stop();assert(syllables.every(n=>n.stopped));
els.cap.value='1';els.cap.handlers.input();await bench.play('stretch');state=bench.getState();assert(state.rows.every(r=>r.ratio===1));assert(state.rows.some(r=>r.overlap>0));bench.stop();
els.cap.value='1.5';els.cap.handlers.input();await bench.play('original');state=bench.getState();assert(state.rows.every(r=>r.ratio===1));bench.stop();
els.tempo.value='320';els.tempo.handlers.input();els.cap.value='6';els.cap.handlers.input();await bench.play('stretch');state=bench.getState();
assert.equal(state.playback,'playing');assert.equal(state.parameters.tempo,320);assert(state.rows.some(r=>r.ratio>3));assert(state.rows.every(r=>r.ratio<=6));bench.stop();
console.log(JSON.stringify({ok:true,nominalRateWpm:175,recordings:29,pitchPreservedAt:[22050,48000],profiles:3,controller:'original/stretched/capped/stop verified'}));

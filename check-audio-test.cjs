const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const settle=()=>new Promise(setImmediate);
(async()=>{
 const html=fs.readFileSync('dist/audio-test.html','utf8'),els={};
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))els[id]={textContent:'',value:'',focus(){},select(){}};
 const contexts=[],notes=[],timers=new Map(),handlers={};let spoken,sequence=0,insideClick=false,resumeMode='normal',resolveResume;
 class AudioContext{
  constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=44100;contexts.push(this);}
  resume(){assert.ok(insideClick,'initial resume belongs to the click');
   if(resumeMode==='reject')return Promise.reject(Error('activation refusée'));
   if(resumeMode==='pending')return new Promise(resolve=>{resolveResume=()=>{this.state='running';resolve();};});
   this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createBuffer(){return {};}
  createBufferSource(){return {connect(){},disconnect(){},stop(){},start(){assert.ok(insideClick);queueMicrotask(()=>this.onended?.());}};}
  createOscillator(){const audio=this;return {frequency:{},connect(){},disconnect(){},stop(){},start(t){notes.push({audio,t,f:this.frequency.value,node:this});}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 let mediaPlays=0;
 Object.assign(els.recording,{currentTime:0,pause(){},play(){assert.ok(insideClick);mediaPlays++;this.onplaying?.();return Promise.resolve();}});
 const context=vm.createContext({document:{getElementById:id=>els[id],addEventListener:(k,f)=>handlers[k]=f},navigator:{userAgent:'iPhone; CPU iPhone OS 16_0_2 like Mac OS X'},window:{AudioContext,addEventListener(){},speechSynthesis:{getVoices:()=>[{lang:'it-IT'}],speak:u=>{spoken=u;},cancel(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}},setTimeout:(f,ms)=>{timers.set(++sequence,{f,ms});return sequence;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync('dist/note-synth.js','utf8'),context);
 vm.runInContext(fs.readFileSync('dist/audio-test.js','utf8'),context);
 const click=id=>{insideClick=true;try{els[id].onclick();}finally{insideClick=false;}};
 assert.equal(contexts.length,0,'no sound or context at page load');
 assert.match(els.report.value,/Audio Session disponible : non/);
 click('tone');await settle();assert.equal(notes.length,1);assert.equal(notes[0].f,440);assert.equal(spoken,undefined);
 notes[0].node.onended();assert.match(els.result.textContent,/As-tu entendu/);
 click('speechTone');await settle();assert.equal(contexts[0].state,'closed');assert.equal(contexts.length,2);assert.equal(notes.length,1);assert.equal(spoken.text,'La');
 spoken.onstart();spoken.onend();await settle();assert.equal(notes.length,2);assert.match(els.report.value,/Fin de parole reçue/);
 spoken.onend();await settle();assert.equal(notes.length,2,'duplicate callback does not play twice');
 click('file');await settle();assert.equal(contexts[1].state,'closed');assert.equal(mediaPlays,1);assert.equal(notes.length,2,'WAV does not use the synthesizer');els.recording.onended();
 click('speechTone');await settle();const stale=spoken.onend;click('file');stale();await settle();assert.equal(notes.length,2);
 click('speechTone');await settle();spoken.onerror({error:'interrupted'});await settle();assert.equal(notes.length,3);assert.match(els.report.value,/Erreur de parole : interrupted/);
 click('speechTone');await settle();const noEnd=spoken.onend;
 for(const {f,ms} of [...timers.values()])if(ms===8000)f();assert.match(els.result.textContent,/n’a pas démarré/);
 assert.equal(notes.length,3,'diagnostic timeout does not force a note over speech');
 click('stop');noEnd();await settle();assert.equal(notes.length,3);assert.equal(timers.size,0);
 resumeMode='reject';click('tone');await settle();assert.equal(notes.length,3);assert.match(els.report.value,/activation refusée/);
 resumeMode='pending';click('tone');click('file');resolveResume();await settle();assert.equal(notes.length,3,'stale activation cannot start a note');
 assert.ok(html.includes('note-synth.js?v=1'));assert.ok(fs.readFileSync('dist/index.html','utf8').includes('note-synth.js?v=1'));
 console.log('PASS audio diagnostic: isolated contexts, shared synth, speech order, native file, errors and stale cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});

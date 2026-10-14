'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const model=require('./dist/blocs.js'),speech=require('./dist/bloc-speech.js'),phonetics=require('./dist/phonetics-engine.js'),Transport=require('./dist/transport.js');
const score=require('./dist/score.json'),assets=require('./dist/bloc-speech-audio.json'),map=speech.createMap(score,phonetics),settle=()=>new Promise(setImmediate);
const legacy=require('./tests/fixtures/legacy-blocs.cjs');
function originalFields(b){const {adaptive,targetMeasures,attackEnd,allowAttackAtEnd,...original}=b;return original;}
for(let part=0;part<5;part++)for(const cells of [8,32,160]){
 assert.deepEqual(model.buildBlocs(score,part,{measures:2,cells}).map(originalFields),legacy.buildBlocs(score,part,{cells}));
}
let placements=0,clipped=0;
for(let size=1;size<=8;size++)for(let part=0;part<5;part++){
 const blocks=model.buildBlocs(score,part,{measures:size});
 const active=[...new Set(score.parts[part].events.filter(e=>e.pitch!==null).map(e=>e.m))].sort((a,b)=>a-b);
 assert.deepEqual(blocks.flatMap(c=>c.core),active);
 for(const [i,b] of blocks.entries()){
  assert(b.start<b.end);assert(b.indices.length>0);
  if(i)assert(blocks[i-1].core.at(-1)<b.core[0]);
  assert(b.indices.every(j=>score.parts[part].events[j].pitch!==null));
  for(const leadIn of [false,true]){
   const range=model.withEnding(score,part,model.withLeadIn(score,part,b,leadIn));
   assert.deepEqual(range.core,b.core);assert.equal(range.end,b.end);
   assert.equal(range.start,leadIn&&i>0?Math.min(b.start,score.starts[Math.max(0,b.core[0]-1)]):b.start);
   for(const tempo of [30,80,160]){
    const cues=speech.plan(score,part,range,tempo,map);
    assert.equal(new Set(cues.map(c=>c.beat)).size,cues.length);
    for(const cue of cues){
     assert(cue.beat>=range.start&&cue.beat<range.end);
     assert(cue.endBeat>cue.beat);assert(assets[cue.ipa]?.length);
     const asset=assets[cue.ipa].find(a=>a.duration<=cue.room-.012)||assets[cue.ipa].at(-1);
     if(asset.duration>cue.room)clipped++;
     assert(fs.existsSync('dist/'+asset.url));placements++;
    }
   }
  }
 }
}
for(let size=1;size<=8;size++){
 const bs=model.buildBlocs(score,0,{measures:size});
 assert(bs.some(b=>b.core.includes(41)&&b.core.includes(42)),'closing Amen must be absorbed');
 assert(!bs.some(b=>b.core.some(m=>m>=43&&m<=51)),'silent measures must be skipped');
 const resumed=bs.find(b=>b.core[0]===52),first=score.parts[0].events.find(e=>e.pitch!==null&&e.m===52);
 assert(resumed);assert.equal(resumed.start,first.t-(score.starts[53]-score.starts[52]));
}
assert(model.buildBlocs(score,0,{measures:8}).length<model.buildBlocs(score,0,{measures:1}).length);
const full=model.passage(score,0,0,107),fullCues=speech.plan(score,0,full,80,map);
assert.equal(fullCues.length,score.parts[0].events.filter(e=>e.pitch!==null&&e.sy&&!e.continued&&!e.ties.includes('stop')&&!e.grace).length);
const empty={starts:[0,4,8,12,16,20],parts:[{events:[]}]};
assert.equal(model.buildBlocs(empty,0,{measures:2}).length,0);
assert.throws(()=>model.buildBlocs(empty,0,{measures:9}));assert.throws(()=>model.buildBlocs(empty,0,{measures:0}));
const held={starts:[0,4,8],parts:[{events:[{m:0,t:0,d:4,pitch:60,sy:'a',word:'a',wi:0,continued:false,ties:['start']},{m:1,t:4,d:4,pitch:60,sy:'a',word:'a',wi:0,continued:true,ties:['stop']}]}]};
assert.equal(model.mergedNotes(held).length,1);assert.equal(model.mergedNotes(held)[0].d,8);
const heldMap=speech.createMap(held,phonetics);
assert.equal(speech.plan(held,0,model.passage(held,0,0,1),80,heldMap).length,1);
assert.equal(speech.plan(held,0,model.passage(held,0,1,1),80,heldMap)[0].ipa,'a');
function clockHarness(){
 let now=0,nextId=0;const timers=new Map(),nodes=[];
 const audio={state:'running',sampleRate:48000,get currentTime(){return now;},
  createBufferSource(){const node={kind:'syllable',connect(){},disconnect(){},start(time,offset=0,duration){Object.assign(this,{time,offset,duration});nodes.push(this);},stop(){this.stopped=true;}};return node;},
  createGain(){return {gain:{value:0},connect(){},disconnect(){}};}};
 function setTimer(fn,ms){const id=++nextId;timers.set(id,{fn,time:now+ms/1000});return id;}
 function clearTimer(id){timers.delete(id);}
 async function tick(seconds){
  const end=now+seconds;
  for(;;){const next=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!next)break;now=next[1].time;timers.delete(next[0]);next[1].fn();await settle();}
  now=end;await settle();
 }
 return {audio,nodes,timers,tick,setTimer,clearTimer,setNow(value){now=value;}};
}
async function testTransport(){
 const h=clockHarness(),positions=[],errors=[];
 const t=new Transport({audio:h.audio,notes:[{t:0,d:4,pitch:60,part:0},{t:4,d:4,pitch:62,part:1}],assets:{a:[{url:'a',duration:2,gain:.2}]},buffers:new Map([['a',{duration:2}]]),
  scheduleTone(e,time,duration,volume){const node={kind:'tone',time,duration,volume,stop(){this.stopped=true;}};h.nodes.push(node);return node;},
  setTimer:h.setTimer,clearTimer:h.clearTimer,onPosition:b=>positions.push(b),onError:e=>errors.push(e)});
 t.configure({start:0,end:8},[{ipa:'a',beat:0,endBeat:4,index:0},{ipa:'a',beat:4,endBeat:8,index:1}],0,60);t.play();
 assert.equal(h.nodes[0].time,h.nodes[1].time);assert.equal(h.nodes[0].volume,.13);
 await h.tick(.5);const atPause=t.position();assert(Math.abs(atPause-.465)<.001);
 t.pause();assert(h.nodes.every(n=>n.stopped));assert.equal(h.timers.size,0);
 await h.tick(2);assert.equal(t.position(),atPause);
 t.play();const resumed=h.nodes.at(-1);assert.equal(resumed.kind,'syllable');assert(Math.abs(resumed.offset-atPause)<.001);
 await h.tick(.5);const beforeTempo=t.position(),oldNodes=[...t.nodes];t.setTempo(120);assert.equal(t.position(),beforeTempo);assert(oldNodes.every(n=>n.stopped));
 await h.tick(.5);assert(Math.abs(t.position()-(beforeTempo+.93))<.001);
 const beforeSeek=[...t.nodes];t.seek(4);assert(beforeSeek.every(n=>n.stopped));assert.equal(t.position(),4);assert.equal(t.state,'playing');
 assert.equal(h.nodes.at(-1).time,h.nodes.at(-2).time);
 t.pause();t.seek(0);assert.equal(t.state,'paused');assert.equal(t.position(),0);assert.equal(h.timers.size,0);
 t.play();await h.tick(4.1);assert.equal(t.state,'ended');assert.equal(t.position(),8);assert.equal(h.timers.size,0);assert.equal(errors.length,0);
 t.stop();assert.equal(t.position(),0);
 // One continuous scheduler traverses bar boundaries without retriggering the
 // sustained note or the syllable at the start of the following block.
 t.play();const before=h.nodes.length;await h.tick(2.1);assert.equal(h.nodes.length-before,2);
}
function element(id=''){
 return {id,value:'',textContent:'',hidden:false,disabled:false,checked:false,attrs:{},children:[],
 append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;}};
}
async function mount(store=new Map(),search='',unavailable=false,autoSpeech=true,options={}){
 const html=fs.readFileSync('dist/index.html','utf8'),els=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,element(id)]));
 let mediaPlays=0,spoken=0,cancelCount=0,localTextReads=0;const utterances=[];els.audioPrimer.play=()=>{mediaPlays++;return Promise.resolve();};els.audioPrimer.pause=()=>{};
 const h=clockHarness(),registry={},handlers={},windowHandlers={},traces=[];
 class AudioContext{
  constructor(){this.state='running';this.sampleRate=48000;}
  get currentTime(){return h.audio.currentTime;}
  resume(){this.state='running';return Promise.resolve();}
  createBufferSource(){return h.audio.createBufferSource();}
  createBuffer(){return {duration:0,primer:true};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},value:0},connect(){},disconnect(){}};}
  createOscillator(){const node={frequency:{},connect(){},disconnect(){},start(time){this.time=time;h.nodes.push(this);},stop(time){if(time===undefined)this.stopped=true;}};return node;}
  decodeAudioData(bytes,resolve){resolve({duration:bytes.duration});}
 }
 const durations=new Map(Object.values(assets).flat().map(a=>[a.url,a.duration]));
 const window={AudioContext,navigator:{userAgent:'Desktop',platform:'Desktop'},addEventListener:(k,f)=>windowHandlers[k]=f,
  SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  speechSynthesis:{getVoices(){return options.voices??[{lang:'it-IT',name:'Test italien'}];},addEventListener(){},
   speak(u){spoken++;utterances.push(u);if(autoSpeech)queueMicrotask(()=>{u.onstart?.();u.onend?.();});},
   cancel(){cancelCount++;}},PlaybackDebug:{record:(event,data)=>traces.push({event,...data})}};
 const document={getElementById:id=>els[id],createElement:()=>element(),addEventListener:(k,f)=>handlers[k]=f,modelContext:{registerTool:t=>registry[t.name]=t}};
 let href='http://localhost/'+search;
 const location={get href(){return href;},get search(){return new URL(href).search;},assign(url){href=new URL(url,href).href;}};
 const sandbox=vm.createContext({window,document,console,URL,URLSearchParams,location,performance:{now:()=>h.audio.currentTime*1000},
  history:{replaceState(a,b,url){href=url.href;}},localStorage:{getItem(k){if(unavailable)throw Error('denied');return store.get(k)||null;},setItem(k,v){if(unavailable)throw Error('denied');store.set(k,v);}},
  fetch:async url=>({ok:true,json:async()=>url==='score.json'?score:assets,arrayBuffer:async()=>({duration:durations.get(url)})}),
  setTimeout:h.setTimer,clearTimeout:h.clearTimer});
 sandbox.PracticeLibrary={list:async()=>{if(options.libraryDenied)throw Error('Stockage refusé');return options.records||[];}};
 if(options.imported){
  const importedScore=JSON.parse(JSON.stringify(score));Object.assign(importedScore,{verse:'1',verseNumbers:['1'],warnings:[],language:options.language||'fr'});
  sandbox.PracticeLibrary={list:async()=>options.records||[],loadBundle:async()=>({record:{verses:{1:{}}},score:importedScore,assets,map,continuations:{},language:importedScore.language}),
   getAudio:async()=>{localTextReads++;return {blob:{arrayBuffer:async()=>({duration:1})},gain:.1};}};
  sandbox.MusicXMLImport={applyVerse(){}};sandbox.ImportSpeech={romanGreek:text=>text};
 }
 if(options.noNative){delete window.speechSynthesis;delete window.SpeechSynthesisUtterance;}
 for(const file of ['blocs.js','note-synth.js','phonetics-engine.js','bloc-speech.js','transport.js','score-navigation.js','lab.js']){vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),sandbox);if(file==='phonetics-engine.js')sandbox.LatinPhonetics=window.LatinPhonetics;}
 for(let i=0;i<25;i++)await settle();
 assert.equal(els.workspace.hidden,false,els.status.textContent);
 const get=()=>registry.get_practice_position.execute();
 async function click(id){if(els[id].hidden)return;els[id].onclick();for(let i=0;i<25;i++)await settle();}
 return {els,get,click,h,handlers,window,document,registry,store,location,spoken:()=>spoken,localTextReads:()=>localTextReads,utterances,cancelCount:()=>cancelCount,traces,mediaPlays:()=>mediaPlays};
}
async function testEnding(){
 const e=(m,t,d,pitch,sy,wi,ties=[],grace=false)=>({m,t,d,pitch,sy,word:sy,wi,ties,grace,continued:ties.includes('stop')});
 const s={starts:[0,4,8,12],parts:[
  {events:[e(0,0,4,60,'a',0),e(1,4,0,61,'',1,[],true),e(1,4,1,62,'e',2),e(1,5,1,64,'i',3),e(2,8,4,65,'u',4)]},
  {events:[e(0,0,8,72,'',0),e(1,4,2,74,'',1),e(1,4.5,1,76,'',2),e(1,5,1,77,'',3)]}
 ]};
 const blocks=model.buildBlocs(s,0,{measures:1}),c=model.withEnding(s,0,model.withLeadIn(s,0,blocks[0],false));
 assert.equal(blocks[0].end,5);assert.equal(c.end,5);assert.deepEqual(c.core,[0]);assert.equal(c.extensionIndex,2);assert.equal(c.extensionMeasure,1);
 assert.deepEqual(c.indices,[0,1,2]);assert.equal(c.text,'a e');
 const withAmorce=model.withEnding(s,0,model.withLeadIn(s,0,blocks[1],true));
 assert.equal(withAmorce.start,0);assert.equal(withAmorce.end,12);assert.deepEqual(withAmorce.core,[1,2]);
 const last=model.withEnding(s,0,blocks.at(-1));assert.equal(last.end,12);assert.equal(last.extensionIndex,null);
 const smap=speech.createMap(s,phonetics),cues=speech.plan(s,0,c,60,smap);
 assert.equal(cues.at(-1).index,2);assert.equal(cues.at(-1).beat,4);
 assert.equal(cues.at(-1).room,1);
 const h=clockHarness(),tones=[];
 const make=range=>new Transport({audio:h.audio,notes:model.mergedNotes(s),assets:{a:[{url:'a',duration:.1,gain:.2}],e:[{url:'e',duration:.1,gain:.2}]},
  buffers:new Map([['a',{duration:.1}],['e',{duration:.1}]]),setTimer:h.setTimer,clearTimer:h.clearTimer,
  scheduleTone(note,time,duration){tones.push({pitch:note.pitch,time,duration});return {stop(){}};}});
 const t=make(c);t.configure(c,cues,0,60);t.play();await h.tick(5.1);
 assert.equal(t.state,'ended');
 assert(tones.some(n=>n.pitch===62));assert(tones.some(n=>n.pitch===74));
 assert(!tones.some(n=>[64,76,77].includes(n.pitch)));
 assert.equal(tones.find(n=>n.pitch===72).duration,5);
 const t2=make(c);t2.configure(c,cues,0,60);t2.play();t2.seek(4.4);await h.tick(.3);t2.pause();t2.setTempo(120);t2.play();await h.tick(.3);
 assert(!tones.some(n=>[64,76,77].includes(n.pitch)));
 t2.stop();
 // Complete playback still plays attacks that are omitted from the closing
 // context of a practice block.
 const full=model.passage(s,0,0,2),t3=make(full);
 t3.configure(full,[],0,60);t3.play();await h.tick(6);
 assert(tones.some(n=>n.pitch===64));assert(tones.some(n=>n.pitch===76));assert(tones.some(n=>n.pitch===77));t3.stop();
 const heldRange=model.withEnding(held,0,model.buildBlocs(held,0,{measures:1})[0]);
 assert.equal(heldRange.end,8);assert.equal(heldRange.extensionIndex,null);
 const sparse={starts:[0,4,8,12,16],parts:[{events:[e(0,0,1,60,'a',0),e(3,12,1,62,'e',1)]}]};
 const gap=model.withEnding(sparse,0,model.buildBlocs(sparse,0,{measures:1})[0]);
 assert.equal(gap.end,2);assert.equal(gap.extensionIndex,null);
 const rest=model.withEnding(sparse,0,model.buildBlocs(sparse,0,{measures:1})[1]);
 assert.equal(rest.start,8);assert.deepEqual(rest.core,[3]);assert.equal(rest.indices.length,1);
 const shortGap={...sparse,parts:[{events:[e(0,0,1,60,'a',0),e(2,8,1,62,'e',1)]}]};
 assert.equal(model.withEnding(shortGap,0,model.buildBlocs(shortGap,0,{measures:1})[0]).end,4);
 console.log('Prolongement : note suivante et syllabe, amorce cumulée, accompagnement sans nouvelles attaques, notes liées, silences, dernier bloc, pause/tempo et lecture complète vérifiés.');
}
async function testNaturalSpeech(){
 const a=await mount(new Map(),'',false,false);
 await a.click('blocPlay');
 assert.equal(a.spoken(),1);
 assert.equal(a.get().playback,'loading');
 assert.equal(a.h.nodes.filter(n=>n.type==='triangle').length,0);
 const u=a.utterances[0];u.onstart();
 assert.equal(a.h.nodes.filter(n=>n.type==='triangle').length,0);
 u.onend();for(let i=0;i<25;i++)await settle();
 assert.equal(a.get().playback,'playing');
 assert(a.h.nodes.some(n=>n.type==='triangle'));
 assert(a.traces.findIndex(t=>t.event==='speech-end')<a.traces.findIndex(t=>t.event==='music-start'));
 await a.click('blocPlay');const staleEnd=a.utterances.at(-1).onend;
 a.handlers.keydown({key:'Escape'});assert.equal(a.cancelCount(),1);staleEnd();await settle();
 assert.equal(a.get().playback,'stopped');assert(a.h.nodes.every(n=>n.stopped));
 await a.click('blocPlay');const beforeFull=a.spoken(),lateEnd=a.utterances.at(-1).onend;
 await a.click('fullPlay');lateEnd();await settle();
 assert.equal(a.spoken(),beforeFull);assert.equal(a.get().mode,'complete');assert.equal(a.get().playback,'playing');
 assert.equal(a.cancelCount(),2);
 await a.click('fullPlay');await a.click('fullPlay');assert.equal(a.spoken(),beforeFull);
 const b=await mount(new Map(),'',false,false);
 await b.click('blocPlay');const oldEnd=b.utterances.at(-1).onend;
 await b.click('next');oldEnd();await settle();assert.equal(b.get().bloc,1);assert.equal(b.get().playback,'loading');
 assert.equal(b.spoken(),2);assert.equal(b.cancelCount(),1);assert(!b.traces.some(t=>t.event==='music-start'));
 const nextEnd=b.utterances.at(-1).onend;
 await b.click('next');nextEnd();await settle();assert.equal(b.get().bloc,2);assert.equal(b.get().playback,'loading');
 assert.equal(b.spoken(),3);assert.equal(b.cancelCount(),2);assert(!b.traces.some(t=>t.event==='music-start'));
 b.utterances.at(-1).onend();for(let i=0;i<25;i++)await settle();
 assert.equal(b.get().playback,'playing');assert.equal(b.traces.filter(t=>t.event==='music-start').length,1);
 await b.click('previous');assert.equal(b.get().bloc,1);assert.equal(b.get().playback,'loading');assert.equal(b.spoken(),4);
 b.utterances.at(-1).onend();for(let i=0;i<25;i++)await settle();assert.equal(b.get().playback,'playing');
 const stalled=await mount(new Map(),'',false,false);
 await stalled.click('blocPlay');await stalled.h.tick(6.8);
 assert.equal(stalled.get().playback,'playing');
 assert.equal(stalled.spoken(),2);assert.equal(stalled.cancelCount(),2);
 assert(stalled.els.announcement.textContent.includes('Lecture du texte indisponible'));
 const hidden=await mount(new Map(),'',false,false);
 await hidden.click('blocPlay');const hiddenEnd=hidden.utterances.at(-1).onend;
 hidden.handlers.keydown({key:'Escape'});hiddenEnd();await settle();assert.equal(hidden.get().playback,'stopped');
 console.log('Lecture naturelle : avant les blocs uniquement, ordre texte/musique, arrêt, navigation, passage au morceau entier, reprises sans texte et attente bornée vérifiés.');
}
async function testImportedNaturalSpeech(){
 const voice={lang:'fr-FR',name:'Voix française locale',localService:true};
 const a=await mount(new Map(),'?score=test',false,false,{imported:true,voices:[{lang:'fr-FR',name:'Voix distante',localService:false},voice]});
 await a.click('blocPlay');assert.equal(a.spoken(),1);assert.equal(a.localTextReads(),0);
 assert.equal(a.utterances[0].voice,voice);assert.equal(a.utterances[0].rate,.85);assert.equal(a.get().playback,'loading');
 a.utterances[0].onend();for(let i=0;i<25;i++)await settle();assert.equal(a.get().playback,'playing');
 await a.click('next');const staleEnd=a.utterances.at(-1).onend;await a.click('previous');
 staleEnd();for(let i=0;i<25;i++)await settle();assert.equal(a.localTextReads(),0);assert.equal(a.get().bloc,0);assert.equal(a.get().playback,'loading');
 a.handlers.keydown({key:'Escape'});a.utterances.at(-1).onend?.();await settle();assert.equal(a.get().playback,'stopped');assert.equal(a.localTextReads(),0);
 const b=await mount(new Map(),'?score=test',false,false,{imported:true,language:'de',voices:[voice,{lang:'de-DE',localService:false}]});
 await b.click('blocPlay');assert.equal(b.spoken(),0);assert.equal(b.localTextReads(),1);
 const localNode=b.h.nodes.find(n=>n.buffer?.duration===1);assert(localNode);assert(!b.traces.some(t=>t.event==='music-start'));
 localNode.onended();for(let i=0;i<25;i++)await settle();assert.equal(b.get().playback,'playing');
 const failed=await mount(new Map(),'?score=test',false,false,{imported:true,voices:[voice]});
 await failed.click('blocPlay');failed.utterances[0].onerror({error:'synthesis-failed'});for(let i=0;i<25;i++)await settle();
 assert.equal(failed.localTextReads(),1);const fallback=failed.h.nodes.find(n=>n.buffer?.duration===1);assert(fallback);
 failed.handlers.keydown({key:'Escape'});fallback.onended();for(let i=0;i<25;i++)await settle();assert.equal(failed.get().playback,'stopped');assert(fallback.stopped);
 const none=await mount(new Map(),'?score=test',false,false,{imported:true,noNative:true});
 await none.click('blocPlay');assert.equal(none.localTextReads(),1);none.handlers.keydown({key:'Escape'});
 await none.click('fullPlay');assert.equal(none.localTextReads(),1);assert.equal(none.get().playback,'playing');
 const latin=await mount(new Map(),'?score=test',false,false,{imported:true,language:'la',voices:[{lang:'it-IT',localService:true}]});
 await latin.click('blocPlay');assert.equal(latin.utterances[0].lang,'it-IT');assert.equal(latin.localTextReads(),0);
 console.log('Import : voix locale prioritaire, langue du couplet, latin italien, secours sans voix ou après échec, annulation et navigation vérifiés.');
}
async function testApp(){
 const html=fs.readFileSync('dist/index.html','utf8');
 for(const file of ['boutons','liste','pas','syllabe'])assert.equal(fs.readFileSync('dist/'+file+'.html','utf8'),html);

 const a=await mount();assert.equal(a.get().measures,2);assert.equal(a.get().totalBlocs,44);assert.equal(a.get().playback,'stopped');assert(!a.get().leadIn);
 assert.equal(a.els.measure.value,'1');
 assert.equal(a.els.blocInfo.textContent,'Bloc 1 sur 44 — mesures 1 à 2 sur 108');
 assert.equal(a.els.previous.getAttribute('aria-disabled'),'true');
 assert.equal(a.els.previous.disabled,false);
 await a.click('previous');assert.equal(a.get().bloc,0);assert.equal(a.get().playback,'stopped');assert.equal(a.spoken(),0);
 await a.click('stop');assert.equal(a.get().playback,'stopped');
 a.els.measures.value='4';a.els.measures.onchange();
 a.els.measure.value='7';a.els.goMeasure.onsubmit({preventDefault(){}});assert.equal(a.get().measure,5);assert.equal(a.get().endMeasure,8);
 a.els.leadIn.checked=true;a.els.leadIn.onchange();assert.equal(a.els.blocInfo.textContent,'Bloc 2 sur 25 — mesures 4 à 8 sur 108');
 await a.click('blocPlay');assert.equal(a.get().playback,'playing',a.els.announcement.textContent);assert.equal(a.spoken(),1);
 assert(a.h.nodes.some(n=>n.buffer&&!n.buffer.primer));
 a.handlers.keydown({key:'Escape'});assert.equal(a.get().measure,5);assert.equal(a.get().playback,'stopped');assert(a.h.nodes.every(n=>n.stopped));
 a.els.measures.value='3';a.els.measures.onchange();assert.equal(a.get().measure,4);
 a.els.measure.value='999';a.els.goMeasure.onsubmit({preventDefault(){}});assert(a.els.measureError.textContent);assert.equal(a.get().measure,4);
 const b=await mount(a.store);assert.equal(b.get().measure,4);assert.equal(b.get().measures,3);assert(b.get().leadIn);assert.equal(b.get().playback,'stopped');assert.equal(b.h.nodes.length,0);assert.equal(b.els.measure.value,'4');
 a.els.voice.value='4';a.els.voice.onchange();assert.equal(a.get().measure,model.buildBlocs(score,4)[0].core[0]+1);assert.equal(a.get().measures,2);
 a.els.voice.value='0';a.els.voice.onchange();assert.equal(a.get().measure,4);assert.equal(a.get().measures,3);
 const closing=await mount();
 closing.els.measure.value='41';closing.els.goMeasure.onsubmit({preventDefault(){}});
 assert.equal(closing.get().measure,41);assert.equal(closing.get().endMeasure,43);
 await closing.click('blocPlay');await closing.click('next');assert.equal(closing.get().measure,53);assert.equal(closing.get().playback,'playing');assert.equal(closing.spoken(),2);
 await closing.click('previous');assert.equal(closing.get().measure,41);assert.equal(closing.get().endMeasure,43);assert.equal(closing.get().playback,'playing');assert.equal(closing.spoken(),3);
 closing.els.measure.value='49';closing.els.goMeasure.onsubmit({preventDefault(){}});
 assert.equal(closing.get().measure,53);assert.equal(closing.get().playback,'stopped');
 const restoredClosing=await mount(closing.store);assert.equal(restoredClosing.get().measure,53);assert.equal(restoredClosing.get().playback,'stopped');
 const speechBeforeFull=a.spoken();await a.click('fullPlay');assert.equal(a.spoken(),speechBeforeFull);assert.equal(a.get().mode,'complete');assert.equal(a.get().currentMeasure,1);
 await a.h.tick(3);assert(a.get().currentMeasure>=2);
 await a.click('fullPlay');const paused=a.get().currentMeasure;await a.h.tick(2);assert.equal(a.get().currentMeasure,paused);assert.equal(a.get().playback,'paused');
 await a.click('forwardMeasure');assert.equal(a.get().currentMeasure,paused+1);assert.equal(a.get().playback,'paused');
 await a.click('backMeasure');assert.equal(a.get().currentMeasure,paused);
 a.els.tempo.value='120';a.els.tempo.oninput();assert.equal(a.get().tempo,120);assert.equal(a.get().playback,'paused');
 await a.click('fullPlay');assert.equal(a.get().playback,'playing');
 a.els.measures.value='8';a.els.measures.onchange();assert.equal(a.get().playback,'playing');assert.equal(a.get().measures,8);
 const m=a.get().currentMeasure;a.els.leadIn.checked=false;a.els.leadIn.onchange();assert.equal(a.get().currentMeasure,m);assert.equal(a.get().playback,'playing');
 await a.click('stop');assert.equal(a.get().currentMeasure,1);assert.equal(a.get().playback,'stopped');
 a.registry.select_bloc.execute({bloc:3});await a.click('restart');assert.equal(a.get().bloc,0);assert.equal(a.get().tempo,120);assert.equal(a.get().measures,8);assert.equal(a.els.measure.value,'1');
 // Cancellation during asynchronous decoding must never start a stale range.
 const c=await mount();c.els.fullPlay.onclick();c.els.blocPlay.onclick();for(let i=0;i<25;i++)await settle();assert.equal(c.get().bloc,0);assert.equal(c.get().playback,'playing');assert.equal(c.get().mode,'blocs');assert.equal(c.traces.filter(t=>t.event==='music-start').length,1);
 const edge=await mount();edge.registry.select_bloc.execute({bloc:edge.get().totalBlocs});
 await edge.click('next');assert.equal(edge.get().playback,'stopped');assert.equal(edge.spoken(),0);
 await edge.click('blocPlay');const edgeNodes=edge.h.nodes.length,edgeSpoken=edge.spoken();
 await edge.click('next');assert.equal(edge.get().playback,'playing');assert.equal(edge.spoken(),edgeSpoken);assert.equal(edge.h.nodes.length,edgeNodes);
 const ios=await mount();ios.window.navigator.userAgent='iPhone';await ios.click('blocPlay');await ios.h.tick(.7);assert.equal(ios.mediaPlays(),1);assert.equal(ios.get().playback,'playing');
 const denied=await mount(new Map(),'',true);assert(denied.els.storageNotice.textContent);await denied.click('blocPlay');assert.equal(denied.get().playback,'playing');
 const silent=await mount();silent.els.voice.value='2';silent.els.voice.onchange();silent.els.measure.value='108';silent.els.goMeasure.onsubmit({preventDefault(){}});await silent.click('blocPlay');assert.equal(silent.get().playback,'playing');
 console.log('Interface : mémoire par voix, restauration silencieuse, navigation, amorce, transport, tempo, annulation, silence et activation iOS simulée vérifiés.');
}
async function testPieceSettings(){
 const store=new Map(),records=['piece-a','piece-b'].map(id=>({id,score:{title:'Même titre',composer:'Même auteur'}}));
 const a=await mount(store,'?score=piece-a',false,true,{imported:true,records});
 a.els.voice.value='1';a.els.voice.onchange();a.els.tempo.value='101';a.els.tempo.oninput();a.els.measures.value='5';a.els.measures.onchange();a.els.leadIn.checked=true;a.els.leadIn.onchange();
 const savedA=[...store];
 const b=await mount(store,'?score=piece-b',false,true,{imported:true,records});
 assert.equal(b.get().part,0);assert.equal(b.get().measures,2);assert.equal(b.get().leadIn,false);assert.notEqual(b.get().tempo,101);
 b.els.voice.value='3';b.els.voice.onchange();b.els.tempo.value='67';b.els.tempo.oninput();b.els.measures.value='3';b.els.measures.onchange();
 const pilot=await mount(store);assert.equal(pilot.get().part,0);assert.equal(pilot.get().tempo,80);assert.equal(pilot.get().measures,2);assert.equal(pilot.get().leadIn,false);
 assert.equal(store.size,3);for(const [key,value]of savedA)assert.equal(store.get(key),value,'another piece must not overwrite settings');
 const a2=await mount(store,'?score=piece-a',false,true,{imported:true,records});
 assert.equal(a2.get().part,1);assert.equal(a2.get().tempo,101);assert.equal(a2.get().measures,5);assert.equal(a2.get().leadIn,true);
 const b2=await mount(store,'?score=piece-b',false,true,{imported:true,records});
 assert.equal(b2.get().part,3);assert.equal(b2.get().tempo,67);assert.equal(b2.get().measures,3);assert.equal(b2.get().leadIn,false);
 assert.equal(a2.els.scoreChoice.children.length,3);assert.equal(a2.els.scoreChoice.value,'piece-a');assert.equal(a2.els.importLink.href,'importer.html?score=piece-a');
 a2.els.scoreChoice.value='piece-b';a2.els.scoreChoice.onchange();
 const destination=new URL(a2.location.href);assert.equal(destination.search,'?score=piece-b','piece changes must not copy outgoing tempo/voice/size into the next piece');assert.equal(a2.spoken(),0);
 a2.els.scoreChoice.value='';a2.els.scoreChoice.onchange();assert.equal(new URL(a2.location.href).search,'');
 const noLibrary=await mount(new Map(),'',false,true,{libraryDenied:true});assert(noLibrary.els.storageNotice.textContent);assert.equal(noLibrary.els.scoreChoice.children.length,1);assert.equal(noLibrary.get().tempo,80);
 console.log('Morceaux : pilote et deux imports de même titre, réglages distincts, réouverture et changement sans transfert des réglages vérifiés.');
}

async function testPlaybackModes(){
 const html=fs.readFileSync('dist/index.html','utf8');
 assert(html.indexOf('id="restart"')<html.indexOf('id="visual"'));
 assert(html.indexOf('id="visual"')<html.indexOf('id="navigation"'));
 assert(/<p id="visual"[^>]*aria-hidden="true"/.test(html));
 assert(!html.includes('id="accessibleLyrics"'),'block text must not have an exposed screen-reader duplicate');
 const a=await mount();
 const visible=id=>!a.els[id].hidden;
 const idle=()=>{
  assert.equal(a.get().mode,'idle');
  assert(visible('blocPlay'));assert(visible('fullPlay'));
  assert.equal(a.els.fullPlay.textContent,'Jouer le morceau entier');
  for(const id of ['previous','next','backMeasure','forwardMeasure','stop'])assert(!visible(id),id);
 };
 idle();
 await a.click('blocPlay');
 assert.equal(a.get().mode,'blocs');assert(visible('previous'));assert(visible('next'));
 assert(!visible('stop'));assert(!visible('backMeasure'));
 await a.h.tick(20);
 assert.equal(a.get().playback,'ended');assert(visible('next'));
 await a.click('next');assert.equal(a.get().playback,'playing');
 await a.click('fullPlay');
 assert.equal(a.get().mode,'complete');assert(!visible('previous'));assert(!visible('next'));
 for(const id of ['backMeasure','forwardMeasure','stop'])assert(visible(id),id);
 assert.equal(a.els.fullPlay.textContent,'Pause');
 await a.h.tick(3);
 await a.click('fullPlay');assert.equal(a.get().playback,'paused');assert.equal(a.els.fullPlay.textContent,'Reprendre');
 const at=a.get().currentMeasure;await a.h.tick(2);assert.equal(a.get().currentMeasure,at);
 await a.click('forwardMeasure');assert.equal(a.get().currentMeasure,at+1);
 await a.click('fullPlay');assert.equal(a.get().playback,'playing');
 await a.click('stop');idle();
 await a.click('fullPlay');
 await a.h.tick(1000);assert.equal(a.get().playback,'ended');idle();
 await a.click('fullPlay');assert.equal(a.get().playback,'playing');
 await a.click('blocPlay');assert.equal(a.get().mode,'blocs');
 a.handlers.keydown({key:'Escape'});idle();
 const loading=await mount(new Map(),'',false,false);
 await loading.click('blocPlay');assert.equal(loading.get().mode,'blocs');assert(!loading.els.next.hidden);
 loading.handlers.keydown({key:'Escape'});assert.equal(loading.get().mode,'idle');
 const interrupted=await mount();
 interrupted.els.fullPlay.onclick();interrupted.document.hidden=true;interrupted.handlers.visibilitychange();
 for(let i=0;i<25;i++)await settle();
 assert.equal(interrupted.get().mode,'idle');assert.equal(interrupted.get().playback,'stopped');
 assert.equal(interrupted.els.fullPlay.getAttribute('aria-disabled'),'false');

 console.log('Modes : repos, blocs, lecture complète, pause/reprise, déplacements, arrêt, fin naturelle et annulation pendant le texte vérifiés.');
}

(async()=>{await testPlaybackModes();await testPieceSettings();await testTransport();await testEnding();await testNaturalSpeech();await testImportedNaturalSpeech();await testApp();console.log('Protocole historique identique : 5 voix × 3 budgets de texte au réglage 2.');console.log('Blocs : 8 tailles × 5 voix × 2 options d’amorce × 3 tempos ; '+placements+' placements vérifiés ('+clipped+' syllabes bornées à une limite de mesure).');})().catch(e=>{console.error(e);process.exitCode=1;});

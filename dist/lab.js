'use strict';
const $=id=>document.getElementById(id);
let importedRecord=null,importedId='',score,part=0,index=0,tempo=80,measureSize=2,leadIn=false,blocId=0,blocSets=[],mode='idle';
let ctx,primedContext,active=[],ticket=0,mediaPrimed=false,mediaPriming=null,mediaGeneration=0;
let speechMap,speechAssets,notes,transport,fitAsset,loading=false,storageKey,storageFailed=false;
let memory={version:1,part:0,tempo:80,voices:{}},lastSaved='',lastMeasure=-1,lastLyricKey='',lastTransportState='stopped';
const decodedSpeech=new Map(),decodeJobs=new Map();
let fitJob=null,decodeContext;
let brailleCells=32;
let localTextEngine=null,pendingSpeech=null,cancelWaiters=[],speechPhase='',focusedPlaybackControl=null,playbackFocusAt=-Infinity;
const blocs=()=>blocSets[part]||[];
const bloc=()=>blocs()[blocId];
const evs=()=>score.parts[part].events;
function setText(id,text){const element=$(id);if(element.textContent!==text)element.textContent=text;}
function announce(text){setText('announcement',text);}
// ARIA exposes unavailability without removing the current keyboard focus.
function setUnavailable(id,value){
 const element=$(id);
 element.disabled=false;
 element.setAttribute('aria-disabled',String(value));
}
function positionSummary(){return selectedDescription();}
function prefillMeasure(){$('measure').value=String(bloc().core[0]+1);}
function tracePlayback(event,data={}){try{window.PlaybackDebug?.record(event,{ticket,...data});}catch{}}
function prepareVoices(){
 // Request the browser's voice list before the first activation. On Android
 // the first getVoices() can be empty while the speech service initializes.
 try{
  const synthesis=window.speechSynthesis;
  const inspect=()=>tracePlayback('voices-available',{count:synthesis?.getVoices?.().length||0});
  synthesis?.addEventListener?.('voiceschanged',inspect);inspect();
 }catch{}
}

function isAppleTouchDevice(){const nav=window.navigator||{};return /iP(?:hone|ad|od)/.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);}
function speechHandoffDelay(event){
 const control=event?.currentTarget||event?.target;
 const focusAge=control&&control===focusedPlaybackControl?performance.now()-playbackFocusAt:null;
 // The physical TalkBack trace reports detail=1, just like a normal click.
 // Use the recent DOM focus transition, not detail, to cover that case.
 // Keep the existing short margin for zero-detail keyboard/accessibility clicks.
 const nav=window.navigator||{};
 // VoiceOver's announcement is outside speechSynthesis and may start on
 // activation without any DOM focus event, including same-button repeats.
 // Leave a margin on iOS/iPadOS after every activation; keep audio unlock
 // synchronous in playBloc. There is no reliable VoiceOver completion event.
 const ios=isAppleTouchDevice();
 const delay=ios?700:/Android/i.test(nav.userAgent||'')?
  Math.ceil(Math.max(event?.detail===0?700:0,focusAge===null?0:1000-focusAge)):0;
 tracePlayback('speech-handoff',{focusAge:focusAge===null?null:Math.round(focusAge),delay});
 return delay;
}

function lyricUtterance(text){const u=new window.SpeechSynthesisUtterance(text),voices=window.speechSynthesis.getVoices?.()||[];
 const matches=(voice,lang)=>voice.lang.toLowerCase().split(/[-_]/)[0]===lang;
 const language=score?.language||'la',base=language.split('-')[0];
 const choose=matches=>voices.find(matches);
 const voice=choose(v=>v.lang.toLowerCase()===language.toLowerCase())||choose(v=>matches(v,base))||(base==='la'?choose(v=>matches(v,'it')):null);
 if(importedId&&!voice)throw Error('Voix de la langue indisponible.');
 u.lang=voice?voice.lang:(base==='la'?'it-IT':language);if(voice)u.voice=voice;u.rate=.85;return u;}

function waitLocalText(text,mine,delay){return new Promise((resolve,reject)=>{
 let finished=false,node,timer;const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);if(node){try{node.stop();}catch{}node.disconnect();active=active.filter(n=>n!==node);}cancelWaiters=cancelWaiters.filter(fn=>fn!==cancel);speechPhase='';renderState();error?reject(error):resolve();};
 const cancel=()=>finish(Error('cancelled'));cancelWaiters.push(cancel);
 async function start(){try{
  if(finished||mine!==ticket)return cancel();
  timer=setTimeout(()=>finish(Error('Préparation du texte trop longue.')),30000);
  const language=score.language||'la',voice={la:'it',fr:'fr-fr',it:'it',de:'de','en-US':'en-us'}[language]||'it';
  const spoken=language==='la'?ImportSpeech.romanGreek(text):text,cacheId='local-text-1.52dev-v1|'+voice+'|145|'+spoken;
  let cached=await PracticeLibrary.getAudio(cacheId);
  if(!cached){if(!localTextEngine)localTextEngine=new ImportSpeech.Engine();const wav=ImportSpeech.analyseWav(await localTextEngine.run({kind:'text',voice,text:spoken,rate:145}));cached={id:cacheId,blob:new Blob([wav.bytes],{type:'audio/wav'}),duration:wav.duration,gain:Math.min(2,wav.gain*3)};await PracticeLibrary.putAudio(cached);}
  if(finished||mine!==ticket)return cancel();
  const buffer=await new Promise((resolve,reject)=>cached.blob.arrayBuffer().then(bytes=>ctx.decodeAudioData(bytes,resolve,reject),reject));
  if(finished||mine!==ticket)return cancel();clearTimeout(timer);
  node=ctx.createBufferSource();const gain=ctx.createGain();gain.gain.value=cached.gain;node.buffer=buffer;node.connect(gain);gain.connect(ctx.destination);active.push(node);
  node.onended=()=>{gain.disconnect();finish();};speechPhase='reading';renderState();timer=setTimeout(()=>finish(Error('Lecture du texte interrompue.')),(buffer.duration+5)*1000);node.start();
 }catch(error){finish(error);}}
 if(delay)timer=setTimeout(()=>void start(),delay);else void start();
});}

function waitSpeech(text,mine,delay=0){
 if(!text)return Promise.resolve();
 return waitNativeText(text,mine,delay).catch(error=>{
  if(mine!==ticket||!importedId)throw error;
  tracePlayback('natural-speech-local-fallback',{message:error.message});
  speechPhase='waiting';renderState();
  return waitLocalText(text,mine,0);
 });
}
function waitNativeText(text,mine,delay=0){return new Promise((resolve,reject)=>{
 tracePlayback('speech-wait',{delay});
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){reject(Error('Synthèse vocale indisponible.'));return;}
 const synthesis=window.speechSynthesis;
 let finished=false,u,timer,attempts=0;const appleTouch=isAppleTouchDevice();
 const clearAttempt=stop=>{
  clearTimeout(timer);
  if(!u)return;
  u.onstart=u.onend=u.onerror=null;
  if(pendingSpeech===u){pendingSpeech=null;if(stop)try{tracePlayback('speech-cancel');synthesis.cancel();}catch{}}
  u=null;
 };
 const finish=(error,stop=false)=>{if(finished)return;finished=true;clearAttempt(stop);speechPhase='';renderState();cancelWaiters=cancelWaiters.filter(x=>x!==cancel);error?reject(error):resolve();};
 const cancel=()=>finish(Error('cancelled'));cancelWaiters.push(cancel);
 const fail=code=>{
  if(finished||mine!==ticket)return cancel();
  tracePlayback('speech-failure',{reason:code,attempt:attempts});
  clearAttempt(true);
  // iOS gets one bounded attempt: a retry both repeats text and can
  // add several seconds of silence while VoiceOver owns the speech output.
  if(attempts<2&&!appleTouch&&['canceled','interrupted','audio-busy','speech-start-timeout'].includes(code)){
   tracePlayback('speech-retry',{delay:700});
   timer=setTimeout(start,700);return;
  }
  finish(Object.assign(Error('Lecture vocale interrompue.'),{speechError:code}));
 };
 function start(){
  if(finished||mine!==ticket)return cancel();
  attempts++;
  try{
   const utterance=lyricUtterance(text);u=utterance;
   const current=()=>!finished&&mine===ticket&&u===utterance;
   // Never wait forever for a missing start/end event. Cancel our utterance
   // before falling back to the already recorded syllables and music.
   u.onstart=()=>{if(!current())return;speechPhase='reading';renderState();tracePlayback('speech-start',{attempt:attempts});clearTimeout(timer);timer=setTimeout(()=>{if(current())fail('speech-end-timeout');},Math.max(8000,4000+text.length*220/u.rate));};
   u.onend=()=>{if(current()){tracePlayback('speech-end',{attempt:attempts});finish();}};
   u.onerror=event=>{if(current())fail(event.error);};
   pendingSpeech=u;
   timer=setTimeout(()=>{if(current())fail('speech-start-timeout');},appleTouch?1500:3000);
   tracePlayback('speech-request',{attempt:attempts,lang:u.lang,voice:u.voice?.name||null});
   synthesis.speak(u);
  }catch(error){finish(error,true);}
 }
 if(delay)timer=setTimeout(start,delay);else start();
});}

function cancelNaturalSpeech(){
 localTextEngine?.close();localTextEngine=null;
 const hadSpeech=!!pendingSpeech;
 cancelWaiters.splice(0).forEach(cancel=>cancel());pendingSpeech=null;speechPhase='';
 if(hadSpeech)try{window.speechSynthesis?.cancel();}catch{}
}
function resumeAudio(){
 try{return ctx.state==='running'?Promise.resolve(true):Promise.resolve(ctx.resume()).then(()=>ctx.state==='running',()=>false);}
 catch{return Promise.resolve(false);}
}
function primeMediaOutput(){
 if(mediaPrimed)return Promise.resolve(true);
 if(mediaPriming)return mediaPriming;
 const generation=mediaGeneration;
 // This is a native media element, not another source in the Web Audio graph.
 // Keep it unmuted: its WAV samples are zero, but Safari must activate media output.
 try{const playing=$('audioPrimer').play();
  mediaPriming=Promise.resolve(playing).then(()=>{
   if(generation!==mediaGeneration)return false;
   mediaPrimed=true;mediaPriming=null;return true;
  },()=>{if(generation===mediaGeneration)mediaPriming=null;return false;});
  return mediaPriming;
 }catch{return Promise.resolve(false);}
}
function resetMediaOutput(){
 mediaGeneration++;mediaPrimed=false;mediaPriming=null;
 try{const media=$('audioPrimer');media.pause();media.currentTime=0;}catch{}
}

function prepareAudio(){
 // iOS otherwise treats Web Audio as ambient sound, muted by the silent switch.
 // Feature detection keeps browsers without Audio Session support working.
 const nav=window.navigator||{};let playbackSession=false;
 try{const session=nav.audioSession;if(session){if(session.type!=='playback')session.type='playback';playbackSession=session.type==='playback';}}catch{}
 const legacyIOS=!playbackSession&&(/iP(?:hone|ad|od)/.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1));
 // The reported iOS 16 device only enables Web Audio after native file playback.
 // Start that file in the same click, before constructing or resuming the context.
 const mediaReady=legacyIOS?primeMediaOutput():null;
 ensureAudioContext();
 // Start a silent source within the click itself, not after the speech callback.
 // Older mobile Safari may report a running context before its output is unlocked.
 // Confirm the primer actually finished; a stopped/suspended attempt may retry.
 if(primedContext!==ctx||ctx.state!=='running'){
  const audio=ctx,mine=ticket,primer=audio.createBufferSource();
  primer.buffer=audio.createBuffer(1,1,audio.sampleRate);primer.connect(audio.destination);
  active.push(primer);primer.onended=()=>{primer.disconnect();active=active.filter(n=>n!==primer);if(mine===ticket&&audio.state==='running')primedContext=audio;};
  primer.start(0);
 }
 // Invoke resume in the same click, without waiting for the silent source.
 const ready=resumeAudio();
 return mediaReady?Promise.all([mediaReady,ready]).then(results=>results.every(Boolean)):ready;
}

function fingerprint(value){let h=2166136261;for(const c of JSON.stringify(value)){h=Math.imul(h^c.charCodeAt(0),16777619);}return (h>>>0).toString(16);}
function validMeasure(value){return Number.isInteger(value)&&value>=0&&value<score.starts.length-1;}
function voiceMemory(){return memory.voices[part]||{};}
function savePosition(measure=bloc().core[0]){
 if(!validMeasure(measure))measure=bloc().core[0];
 memory.part=part;memory.tempo=tempo;if(importedId)memory.verse=score.verse;memory.voices[part]={measure,measures:measureSize,leadIn};
 const serialized=JSON.stringify(memory);
 if(serialized===lastSaved||storageFailed)return;
 try{localStorage.setItem(storageKey,serialized);lastSaved=serialized;}
 catch{storageFailed=true;setText('storageNotice','La position et les réglages ne peuvent pas être mémorisés dans ce navigateur.');}
}
function syncSettings(){
 try{
  const url=new URL(location.href),trace=url.searchParams.get('trace');
  url.search=new URLSearchParams({part,tempo,measures:measureSize,leadIn:leadIn?'1':'0'}).toString();
  if(trace==='1')url.searchParams.set('trace','1');
  if(importedId){url.searchParams.set('score',importedId);url.searchParams.set('verse',score.verse);}
  if(brailleCells!==32)url.searchParams.set('cells',String(brailleCells));
  if(url.href!==location.href)history.replaceState(null,'',url);
 }catch{}
}
function rebuild(){blocSets=score.parts.map((p,i)=>(p.vocal||!score.parts.some(p=>p.vocal))?BlocModel.buildBlocs(score,i,{measures:measureSize,cells:brailleCells}):[]);}
function selectMeasure(measure,continuous=false){
 let id=blocs().findIndex(c=>c.core[0]<=measure&&measure<=c.core.at(-1));
 if(id<0&&continuous){for(let i=blocs().length-1;i>=0;i--){if(blocs()[i].core[0]<=measure){id=i;break;}}}
 if(id<0&&!continuous)id=blocs().findIndex(c=>c.core[0]>=measure);
 if(id<0)id=continuous?0:blocs().length-1;
 blocId=id;index=bloc().indices[0]??-1;lastLyricKey='';
}
function currentPassage(){return BlocModel.withLeadIn(score,part,bloc(),leadIn);}
function selectedDescription(){
 const c=bloc(),first=c.core[0]+1,b=c.core.at(-1)+1;
 const a=mode!=='complete'?Math.min(first,BlocModel.measureAt(score,currentPassage().start)+1):first;
 return 'Bloc '+(blocId+1)+' sur '+blocs().length+' — '+(a===b?'mesure '+a:'mesures '+a+' à '+b)+' sur '+(score.starts.length-1);
}
function renderLyrics(highlight=false){
 const c=mode==='complete'?bloc():currentPassage(),events=evs(),current=events[index],words=[],seen=new Set();
 for(const i of c.indices){const e=events[i];if(e.wi==null||!e.word||seen.has(e.wi))continue;seen.add(e.wi);words.push({wi:e.wi,text:e.word});}
 const key=part+':'+c.start+':'+c.end+':'+(highlight?index:-1);
 if(key===lastLyricKey)return;lastLyricKey=key;
 const visual=$('visual');visual.replaceChildren();
 if(!words.length)visual.append('Silence dans la voix sélectionnée.');
 for(const [i,word] of words.entries()){
  if(i)visual.append(' ');
  if(!highlight||word.wi!==current?.wi){visual.append(word.text);continue;}
  let cursor=0,range=null;
  for(let j=0;j<=index;j++){
   const e=events[j];if(e.wi!==word.wi||!e.sy||e.continued||e.ties?.includes('stop'))continue;
   const start=word.text.toLocaleLowerCase().indexOf(e.sy.toLocaleLowerCase(),cursor);
   if(start>=0){range=[start,start+e.sy.length];cursor=range[1];}
  }
  if(!range){visual.append(word.text);continue;}
  const mark=document.createElement('mark');mark.textContent=word.text.slice(...range);
  visual.append(word.text.slice(0,range[0]),mark,word.text.slice(range[1]));
 }
}
function renderState(){
 const state=loading?'loading':transport?.state||'stopped',complete=mode==='complete',blocks=mode==='blocs';
 // Hidden controls leave both the visual and screen-reader navigation order.
 for(const [id,visible] of [['previous',blocks],['next',blocks],['backMeasure',complete],['forwardMeasure',complete],['stop',complete]]){
  const element=$(id),hadFocus=document.activeElement===element;
  element.hidden=!visible;
  if(!visible&&hadFocus)$(['previous','next'].includes(id)?'blocPlay':'fullPlay').focus?.();
 }
 $('navigation').className=blocks?'three':'playback-single';
 $('completeNavigation').className=complete?'three':'playback-single';
 setText('fullPlay',complete?(state==='paused'?'Reprendre':'Pause'):'Jouer le morceau entier');
 setUnavailable('fullPlay',complete&&(loading||!['playing','paused'].includes(state)));
 setUnavailable('stop',!complete);
 const position=transport?.range?transport.position():bloc().start,m=BlocModel.measureAt(score,position);
 setUnavailable('backMeasure',loading||!complete||m===0);
 setUnavailable('forwardMeasure',loading||!complete||m===score.starts.length-2);
 $('currentMeasure').hidden=!complete;
}
function render(){
 if(document.activeElement!==$('measure')&&!$('measureError').textContent)prefillMeasure();
 setText('blocInfo',positionSummary());setUnavailable('previous',blocId===0);setUnavailable('next',blocId===blocs().length-1);
 $('voice').value=String(part);$('measures').value=String(measureSize);$('leadIn').checked=leadIn;
 $('tempo').value=String(tempo);setText('tempoValue',String(tempo));
 $('tempo').setAttribute('aria-valuetext',tempo+' pulsations par minute');
 renderLyrics(transport?.state==='playing');renderState();syncSettings();
}
function positionChanged(beat){
 if(!score||!bloc())return;
 const measure=BlocModel.measureAt(score,beat);
 if(mode==='complete'&&measure!==lastMeasure){
  lastMeasure=measure;selectMeasure(measure,true);setText('currentMeasure','Mesure en cours : '+(measure+1));
  setText('blocInfo',positionSummary());setUnavailable('previous',blocId===0);setUnavailable('next',blocId===blocs().length-1);
  savePosition(measure);renderState();
 }
 if(transport?.state==='playing'){
  const cue=transport.cues.filter(c=>c.beat<=beat).at(-1);
  if(cue)index=cue.index;
  renderLyrics(true);
 }
}
function cancelPlayback(nextMode='idle'){
 ticket++;loading=false;mode=nextMode;cancelNaturalSpeech();
 if(transport){const cursor=transport.position();transport.cancelSources();transport.cursor=cursor;transport.state='stopped';}
 for(const node of active){try{node.stop();}catch{}}active=[];
 resetMediaOutput();lastLyricKey='';
}
function stopPlayback(){
 if(!score)return;
 const wasComplete=mode==='complete';
 cancelPlayback();
 if(transport?.range)transport.cursor=transport.range.start;
 if(wasComplete){selectMeasure(0);lastMeasure=0;setText('currentMeasure','Mesure en cours : 1');savePosition(0);}
 else{index=currentPassage().indices[0]??-1;savePosition();}
 render();announce('Lecture arrêtée.');
}
function ensureAudioContext(){
 if(!ctx||ctx.state==='closed')ctx=new(window.AudioContext||window.webkitAudioContext)();
 return ctx;
}
function speechContext(){
 if(!decodeContext){
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  decodeContext=Offline?new Offline(1,1,22050):ensureAudioContext();
 }
 return decodeContext;
}
async function ensureFitter(){
 const audio=speechContext();
 if(!fitAsset){fitJob??=SpeechFit.create(audio,decodedSpeech);try{fitAsset=await fitJob;}catch(error){fitJob=null;throw error;}}
 return fitAsset;
}
async function preloadSpeech(){
 if(!window.AudioContext&&!window.webkitAudioContext)return;
 const assets=speechAssets,audio=speechContext(),sources=new Map();
 for(const list of Object.values(assets)){const source=list.find(a=>a.speed===1)||list[0];if(source)sources.set(source.url,source);}
 let next=0;const queue=[...sources.values()];
 try{
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
   while(next<queue.length){if(speechAssets!==assets||decodeContext!==audio)return;await decodeAsset(queue[next++]);}
  }));
  if(speechAssets!==assets||decodeContext!==audio)return;
  await ensureFitter();if(speechAssets!==assets||decodeContext!==audio)return;
  // Warm the selected voice, including block endings, without starting audio.
  const ranges=[BlocModel.passage(score,part,0,score.starts.length-2),...blocs().map(b=>BlocModel.withEnding(score,part,BlocModel.withLeadIn(score,part,b,leadIn)))];
  for(const range of ranges){
   if(speechAssets!==assets||decodeContext!==audio)return;
   for(const cue of BlocSpeech.plan(score,part,range,tempo,speechMap)){
    const source=assets[cue.ipa].find(a=>a.speed===1)||assets[cue.ipa][0];fitAsset(cue,source,decodedSpeech.get(source.url),tempo);
   }
  }
  tracePlayback('speech-preloaded',{sources:sources.size});
 }catch(error){tracePlayback('speech-preload-error',{message:error.message});}
}
async function decodeAsset(asset){
 if(decodedSpeech.has(asset.url))return decodedSpeech.get(asset.url);
 if(!decodeJobs.has(asset.url)){
  const audio=speechContext();let job;
  job=fetch(asset.url).then(r=>{if(!r.ok)throw Error('Chargement des syllabes impossible.');return r.arrayBuffer();})
   .then(bytes=>new Promise((resolve,reject)=>audio.decodeAudioData(bytes,resolve,reject)))
   .then(buffer=>{if(decodeJobs.get(asset.url)===job){decodedSpeech.set(asset.url,buffer);decodeJobs.delete(asset.url);}return buffer;})
   .catch(error=>{if(decodeJobs.get(asset.url)===job)decodeJobs.delete(asset.url);throw error;});
  decodeJobs.set(asset.url,job);
 }
 return decodeJobs.get(asset.url);
}
async function loadCues(range,mine){
 const cues=BlocSpeech.plan(score,part,range,tempo,speechMap),assets=new Map();
 for(const cue of cues){const variants=speechAssets[cue.ipa];if(!variants?.length)throw Error('Son de syllabe indisponible.');for(const asset of variants)assets.set(asset.url,asset);}
 // Decode source recordings before playback; fit them locally to the tempo.
 const queue=[...assets.values()];let next=0;
 await Promise.all(Array.from({length:Math.min(8,queue.length)},async()=>{
  while(next<queue.length){if(mine!==ticket)return;await decodeAsset(queue[next++]);}
 }));
 if(mine!==ticket)return cues;
 await ensureFitter();
 for(const cue of cues){if(mine!==ticket)return cues;const asset=speechAssets[cue.ipa].find(a=>a.speed===1)||speechAssets[cue.ipa][0];fitAsset(cue,asset,decodedSpeech.get(asset.url),tempo);}
 return cues;
}
async function requestPlayback(complete,event){
 cancelPlayback(complete?'complete':'blocs');
 if(complete)selectMeasure(0);
 const range=complete?BlocModel.passage(score,part,0,score.starts.length-2):currentPassage();
 index=range.indices[0]??-1;lastMeasure=-1;
 const mine=ticket;loading=true;render();savePosition();
 tracePlayback('playback-request',{part,bloc:blocId,mode});
 try{
  const ready=prepareAudio(); // Called synchronously within the native click.
  const natural=complete||!range.text?Promise.resolve():(()=>{
   speechPhase='waiting';renderState();
   return waitSpeech(range.text,mine,speechHandoffDelay(event)).catch(error=>{
    if(mine!==ticket)throw error;
    speechPhase='';renderState();
    tracePlayback('natural-speech-unavailable',{message:error.message});
    announce('Lecture du texte indisponible. Écoute du bloc avec ses syllabes synchronisées.');
   });
  })();
  const [available,cues]=await Promise.all([ready,loadCues(range,mine),natural]);
  if(mine!==ticket)return;
  if(!available)throw Error('Activez le bouton pour autoriser le son.');
  if(!transport||transport.audio!==ctx)transport=new PracticeTransport({
   audio:ctx,notes,assets:speechAssets,buffers:decodedSpeech,fitAsset,
   scheduleTone:(e,start,duration,volume)=>NoteSynth.schedule(ctx,e.pitch,start,duration,volume),
   onPosition:positionChanged,
   onState:state=>{
    if(state==='ended'&&mode==='complete')mode='idle';
    renderState();
    if(state==='ended'&&lastTransportState!=='ended'){announce('Lecture terminée.');renderLyrics(false);}
    lastTransportState=state;
   },
   onError:error=>{tracePlayback('playback-error',{message:error.message});announce(error.message);}
  });
  loading=false;transport.configure(range,cues,part,tempo);transport.play();render();
  tracePlayback('music-start',{part,bloc:blocId,mode,start:range.start,end:range.end,extensionMeasure:range.extensionMeasure,audioState:ctx.state});
 }catch(error){
  if(mine!==ticket)return;
  cancelPlayback();render();announce(error.message);tracePlayback('playback-error',{message:error.message});
 }
}
function moveBloc(delta,event){
 if(blocId+delta<0||blocId+delta>=blocs().length)return;
 const target=blocId+delta;cancelPlayback('blocs');blocId=target;index=bloc().indices[0]??-1;
 savePosition();announce(selectedDescription());
 return requestPlayback(false,event);
}
function restartBeginning(){
 cancelPlayback();mode='idle';selectMeasure(0);prefillMeasure();savePosition(0);render();announce('Retour au début. '+selectedDescription());
}
function seekMeasure(delta){
 if(mode!=='complete'||!transport?.range||loading)return;
 const measure=BlocModel.measureAt(score,transport.position()),target=measure+delta;
 if(target<0||target>=score.starts.length-1)return;
 transport.seek(score.starts[target]);lastMeasure=-1;positionChanged(score.starts[target]);render();
 announce('Mesure '+(target+1)+'. '+(transport.state==='playing'?'Lecture en cours.':'En pause.'));
}
async function togglePause(){
 if(!transport||loading)return;
 if(transport.state==='playing'){transport.pause();render();announce('Lecture en pause.');return;}
 if(transport.state!=='paused')return;
 const mine=ticket;
 if(!await prepareAudio()||mine!==ticket)return;
 transport.play();render();announce('Lecture reprise.');
}
function changeSize(){
 const first=bloc().core[0],continuous=mode==='complete',beat=transport?.position();
 if(!continuous)cancelPlayback();
 measureSize=Number($('measures').value);rebuild();
 selectMeasure(continuous&&Number.isFinite(beat)?BlocModel.measureAt(score,beat):first,continuous);
 savePosition(continuous?BlocModel.measureAt(score,beat??bloc().start):bloc().core[0]);render();
 announce(selectedDescription());
}
function changeVoice(){
 cancelPlayback();part=Number($('voice').value);mode='idle';
 const saved=voiceMemory();measureSize=Number.isInteger(saved.measures)&&saved.measures>=1&&saved.measures<=8?saved.measures:2;leadIn=saved.leadIn===true;
 rebuild();selectMeasure(validMeasure(saved.measure)?saved.measure:0);prefillMeasure();savePosition();render();announce(score.parts[part].name+'. '+selectedDescription());void preloadSpeech();
}
function state(){
 return {part,index,tempo,cells:brailleCells,bloc:blocId,offset:0,mode,measures:measureSize,leadIn,
  measure:bloc().core[0]+1,endMeasure:bloc().core.at(-1)+1,totalBlocs:blocs().length,
  currentMeasure:mode==='complete'&&transport?.range?BlocModel.measureAt(score,transport.position())+1:bloc().core[0]+1,
  playback:loading?'loading':transport?.state||'stopped',text:bloc().text};
}
async function changeVerse(){
 cancelPlayback();const mine=ticket,at=bloc().core[0],previousVerse=score.verse,verse=$('verse').value;loading=true;$('verseSettings').setAttribute('aria-busy','true');renderState();
 try{const bundle=await PracticeLibrary.loadBundle(importedId,verse);
  if(mine!==ticket){for(const list of Object.values(bundle.assets))for(const a of list)if(a.url.startsWith('blob:'))URL.revokeObjectURL(a.url);return;}
  for(const list of Object.values(speechAssets))for(const asset of list)if(asset.url.startsWith('blob:'))URL.revokeObjectURL(asset.url);
  decodedSpeech.clear();decodeJobs.clear();fitAsset=null;fitJob=null;MusicXMLImport.applyVerse(score,verse);speechAssets=bundle.assets;speechMap=bundle.map;score.continuationMap=bundle.continuations;score.language=bundle.language;
  if(transport){transport.cancelSources();transport=null;}mode='idle';rebuild();selectMeasure(at);lastLyricKey='';loading=false;savePosition();render();announce('Couplet '+verse+'. '+selectedDescription());void preloadSpeech();
 }catch(error){if(mine===ticket){$('verse').value=previousVerse;loading=false;render();announce(error.message);}}finally{$('verseSettings').removeAttribute('aria-busy');}
}
async function setupScoreChoice(requestedId){
 const select=$('scoreChoice');
 select.onchange=()=>{
  const target=select.value;
  if(score&&bloc())savePosition(mode==='complete'&&transport?.range?BlocModel.measureAt(score,transport.position()):bloc().core[0]);
  cancelPlayback();location.assign(ScoreNavigation.readerUrl(target));
 };
 $('importLink').href=ScoreNavigation.importUrl(requestedId);
 let records=[];
 try{records=await PracticeLibrary.list();}
 catch{setText('storageNotice','Les morceaux de cet appareil ne peuvent pas être chargés dans ce navigateur.');}
 select.replaceChildren();
 for(const entry of ScoreNavigation.entries(records,{title:'Gloria Patri et Filio',composer:'Belissen'})){
  const option=document.createElement('option');option.value=entry.id;option.textContent=entry.title;select.append(option);
 }
 if(requestedId&&!records.some(r=>r.id===requestedId)){
  const option=document.createElement('option');option.value=requestedId;option.textContent='Morceau indisponible sur cet appareil';select.append(option);
 }
 select.value=requestedId;
}
async function init(){
 try{
  const requestedId=new URLSearchParams(location.search).get('score')||'';
  await setupScoreChoice(requestedId);
  if(requestedId){
   const bundle=await PracticeLibrary.loadBundle(requestedId,new URLSearchParams(location.search).get('verse'));
   importedRecord=bundle.record;importedId=requestedId;score=bundle.score;
   MusicXMLImport.applyVerse(score,new URLSearchParams(location.search).get('verse')||score.verseNumbers[0]);
   speechAssets=bundle.assets;speechMap=bundle.map;score.continuationMap=bundle.continuations;score.language=bundle.language;
   document.title=score.title+' — De vive voix';
   $('verseSettings').hidden=score.verseNumbers.length<2;
   for(const verse of score.verseNumbers){const option=document.createElement('option');option.value=verse;option.textContent='Couplet '+verse+(score.verseLanguages?' — '+({fr:'français',it:'italien',de:'allemand','en-US':'anglais américain',la:'latin italien et grec liturgique'}[score.verseLanguages[verse]]||''):'');$('verse').append(option);}$('verse').value=score.verse;
   $('verse').onchange=()=>void changeVerse();
   setText('scoreImportInfo',score.warnings.join(' '));
  }else{
   const responses=await Promise.all([fetch('score.json'),fetch('bloc-speech-audio.json')]);
   if(responses.some(r=>!r.ok))throw Error('Chargement impossible.');
   [score,speechAssets]=await Promise.all(responses.map(r=>r.json()));
   speechMap=BlocSpeech.createMap(score,LatinPhonetics);
  }
  notes=BlocModel.mergedNotes(score);
  storageKey='de-vive-voix:practice:v1:'+(importedId?importedId+':':'')+fingerprint({title:score.title,composer:score.composer,starts:score.starts,voices:score.parts.map(p=>p.name)});
  try{
   const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(saved?.version===1&&saved.voices&&typeof saved.voices==='object'){memory=saved;lastSaved=JSON.stringify(saved);}
  }catch{storageFailed=true;setText('storageNotice','La position et les réglages ne peuvent pas être mémorisés dans ce navigateur.');}
  if(importedId&&!new URLSearchParams(location.search).has('verse')&&memory.verse&&importedRecord.verses[memory.verse]&&memory.verse!==score.verse){
   const bundle=await PracticeLibrary.loadBundle(importedId,memory.verse);for(const list of Object.values(speechAssets))for(const a of list)if(a.url.startsWith('blob:'))URL.revokeObjectURL(a.url);MusicXMLImport.applyVerse(score,memory.verse);speechAssets=bundle.assets;speechMap=bundle.map;score.continuationMap=bundle.continuations;score.language=bundle.language;$('verse').value=memory.verse;
  }
  const query=new URLSearchParams(location.search),p=Number(query.get('part')??memory.part);
  part=Number.isInteger(p)&&score.parts[p]&&(score.parts[p].vocal||!score.parts.some(p=>p.vocal))?p:Math.max(0,score.parts.findIndex(p=>p.vocal));
  const requestedCells=Number(query.get('cells')??32);brailleCells=Number.isInteger(requestedCells)&&requestedCells>=8&&requestedCells<=160?requestedCells:32;
  const saved=voiceMemory(),t=Number(query.get('tempo')??(lastSaved?memory.tempo:(importedRecord?score.tempo:memory.tempo)));
  tempo=Number.isFinite(t)&&t>=30&&t<=160?t:80;
  const size=Number(query.get('measures')??saved.measures??2);
  measureSize=Number.isInteger(size)&&size>=1&&size<=8?size:2;
  leadIn=query.has('leadIn')?query.get('leadIn')==='1':saved.leadIn===true;
  rebuild();selectMeasure(validMeasure(saved.measure)?saved.measure:0);
  score.parts.forEach((p,i)=>{if(p.vocal||!score.parts.some(p=>p.vocal)){const o=document.createElement('option');o.value=i;o.textContent=p.name;$('voice').append(o);}});
  $('measure').max=String(score.starts.length-1);
  $('blocPlay').onclick=event=>void requestPlayback(false,event);$('fullPlay').onclick=event=>{if($('fullPlay').getAttribute('aria-disabled')==='true')return;void(mode==='complete'?togglePause():requestPlayback(true,event));};
  $('previous').onclick=event=>void moveBloc(-1,event);$('next').onclick=event=>void moveBloc(1,event);
  $('restart').onclick=restartBeginning;$('stop').onclick=()=>{if($('stop').getAttribute('aria-disabled')!=='true')stopPlayback();};
  $('backMeasure').onclick=()=>seekMeasure(-1);$('forwardMeasure').onclick=()=>seekMeasure(1);
  $('voice').onchange=changeVoice;$('measures').onchange=changeSize;
  $('leadIn').onchange=()=>{if(mode!=='complete')cancelPlayback();leadIn=$('leadIn').checked;lastLyricKey='';savePosition(mode==='complete'&&transport?.range?BlocModel.measureAt(score,transport.position()):bloc().core[0]);render();announce(leadIn?'Mesure d’amorce activée.':'Mesure d’amorce désactivée.');};
  $('tempo').oninput=()=>{
   tempo=Number($('tempo').value);transport?.setTempo(tempo);
   savePosition(mode==='complete'&&transport?.range?BlocModel.measureAt(score,transport.position()):bloc().core[0]);render();
  };
  $('goMeasure').onsubmit=e=>{
   e.preventDefault();const target=Number($('measure').value);
   if(!Number.isInteger(target)||target<1||target>=score.starts.length){setText('measureError','Saisissez une mesure de 1 à '+(score.starts.length-1)+'.');return;}
   setText('measureError','');cancelPlayback();mode='idle';selectMeasure(target-1);savePosition();render();announce(selectedDescription());
  };
  document.addEventListener('focusin',event=>{
   focusedPlaybackControl=event.target?.id==='blocPlay'?event.target:null;playbackFocusAt=performance.now();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')stopPlayback();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(loading)cancelPlayback();else{ticket++;cancelNaturalSpeech();transport?.pause();resetMediaOutput();}render();}});
  window.addEventListener('pagehide',()=>{ticket++;cancelNaturalSpeech();transport?.pause();resetMediaOutput();});
  if(document.modelContext?.registerTool){
   try{
    document.modelContext.registerTool({name:'get_practice_position',description:'Lire la voix, le bloc et les réglages sélectionnés.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:state});
    document.modelContext.registerTool({name:'select_bloc',description:'Sélectionner un bloc sans le jouer, numéro à partir de 1.',inputSchema:{type:'object',properties:{bloc:{type:'integer',minimum:1}},required:['bloc'],additionalProperties:false},execute:input=>{
     if(!Number.isInteger(input.bloc)||!blocs()[input.bloc-1])throw Error('Bloc invalide');
     cancelPlayback();mode='idle';blocId=input.bloc-1;index=bloc().indices[0]??-1;savePosition();render();announce(selectedDescription());return state();
    }});
   }catch{}
  }
  $('workspace').hidden=false;setText('status','');prefillMeasure();render();savePosition();void preloadSpeech();
 }catch(error){setText('status','Impossible de charger le morceau. ' + error.message + '');tracePlayback('initialization-error',{message:error.message});}
}
prepareVoices();init();

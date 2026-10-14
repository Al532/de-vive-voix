import {plan,stretchMono} from './tempo-stretch.mjs?v=speech-fit-1';
const $=id=>document.getElementById(id),decoded=new Map(),rendered=new Map();
let manifest,bundle,context,transport,singleSource,ticket=0,rows=[],loading=false,currentMode='';
const ms=value=>Math.round(value*1000)+' ms',factor=value=>'×'+value.toFixed(2).replace('.',',');
function parameters(){return {tempo:Number($('tempo').value),cap:Infinity,profile:$('profile').value,notes:$('notes').checked};}
function passage(){
 const score=bundle.score,data=bundle.verses['1'],full=BlocModel.passage(score,0,0,score.starts.length-2);
 const range=$('passage').value==='second'?{start:8,end:11}:{start:0,end:18};
 const cues=BlocSpeech.plan(score,0,full,parameters().tempo,data.map).filter(c=>c.beat>=range.start&&c.beat<range.end);
 return {range,cues};
}
function highlight(beat){
 const current=rows.filter(row=>row.cue.beat<=beat).at(-1);
 for(const span of $('lyrics').children)span.classList.toggle('current',span.dataset.index===String(current?.cue.index));
}
function renderTable(){
 if(!bundle||!manifest)return;
 const {tempo,cap}=parameters(),{cues}=passage();
 $('tempoValue').textContent=String(tempo);
 $('tempo').setAttribute('aria-valuetext',tempo+' pulsations par minute');
 rows=cues.map(cue=>{const asset=manifest.assets[cue.ipa],room=(cue.endBeat-cue.beat)*60/tempo;return {cue,asset,room,...plan(asset.duration,room,cap)};});
 paintTable();$('lyrics').replaceChildren();
 for(const [i,row]of rows.entries()){
  if(i)$('lyrics').append(document.createTextNode(' · '));
  const span=document.createElement('span');span.textContent=row.cue.text;span.dataset.index=String(row.cue.index);$('lyrics').append(span);
 }
 $('tableNote').textContent='Durées visées. L’écoute calcule ensuite les durées réelles du traitement.';
}
function paintTable(){
 $('rows').replaceChildren();
 for(const row of rows){
  const tr=document.createElement('tr');tr.classList.toggle('exceeds',row.overlap>.001);
  for(const value of [row.cue.text,ms(row.asset.duration),ms(row.room),factor(row.ratio),ms(row.outputDuration),row.overlap>.001?ms(row.overlap):'Aucun']){
   const cell=document.createElement('td');cell.textContent=value;tr.append(cell);
  }
  $('rows').append(tr);
 }
}
export function stop(message='Lecture arrêtée.'){
 ticket++;loading=false;transport?.stop();if(singleSource){try{singleSource.stop();}catch{}singleSource=null;}
 $('audioPrimer').pause();$('stop').disabled=true;highlight(-Infinity);if(message)$('status').textContent=message;
}
function armAudio(){
 try{if(window.navigator?.audioSession)window.navigator.audioSession.type='playback';}catch{}
 // Native silent file plus a Web Audio primer: also unlocks the older iPhone path.
 const media=Promise.resolve($('audioPrimer').play()).catch(()=>{});
 context??=new(window.AudioContext||window.webkitAudioContext)();
 const primer=context.createBufferSource();primer.buffer=context.createBuffer(1,1,context.sampleRate);primer.connect(context.destination);primer.onended=()=>primer.disconnect();primer.start();
 return Promise.all([media,context.resume()]);
}
async function decode(asset){
 if(!decoded.has(asset.url))decoded.set(asset.url,fetch(asset.url).then(r=>{if(!r.ok)throw Error('Son indisponible.');return r.arrayBuffer();}).then(bytes=>context.decodeAudioData(bytes)));
 return decoded.get(asset.url);
}
export async function play(mode){
 if(!bundle||!manifest)return;
 stop('');const mine=ticket,settings=parameters(),selection=passage();currentMode=mode;loading=true;
 $('status').textContent='Préparation de l’écoute…';$('stop').disabled=false;
 try{
  await armAudio();renderTable();
  const assets={},buffers=new Map();
  for(const row of rows){
   const input=await decode(row.asset);if(mine!==ticket)return;
   const ratio=mode==='original'?1:row.ratio,key=row.asset.url+'|'+settings.profile+'|'+ratio.toFixed(7);
   if(!rendered.has(key)){
    const pcm=stretchMono(input.getChannelData(0),input.sampleRate,ratio,settings.profile);
    const output=context.createBuffer(1,pcm.length,input.sampleRate);output.getChannelData(0).set(pcm);rendered.set(key,output);
   }
   // The same phoneme may have different rooms; use a per-cue key for transport.
   const url='prepared:'+row.cue.index,output=rendered.get(key);
   buffers.set(url,output);assets[url]=[{url,duration:output.duration,gain:row.asset.gain,speed:1}];
   row.ratio=ratio;row.outputDuration=output.duration;row.overlap=Math.max(0,output.duration-row.room);
  }
  if(mine!==ticket)return;
  paintTable();$('tableNote').textContent='Durées réellement calculées pour cette écoute.';
  const cues=selection.cues.map(cue=>({...cue,ipa:'prepared:'+cue.index}));
  transport=new PracticeTransport({audio:context,notes:settings.notes?BlocModel.mergedNotes(bundle.score):[],assets,buffers,
   scheduleTone:(e,start,duration,volume)=>NoteSynth.schedule(context,e.pitch,start,duration,volume),
   onPosition:beat=>highlight(beat),
   onState:state=>{if(state==='ended'&&mine===ticket){$('stop').disabled=true;highlight(-Infinity);$('audioPrimer').pause();$('status').textContent='Lecture terminée.';}},
   onError:error=>{$('status').textContent=error.message;}
  });
  loading=false;transport.configure(selection.range,cues,0,settings.tempo);transport.play();
  $('status').textContent=mode==='original'?'Original à 175 mots/minute.':'Accélération sans plafond, fenêtre de 40 ms.';
 }catch(error){if(mine===ticket){stop('');$('status').textContent='Écoute impossible : '+error.message;}}
}
async function sample(asset,label){
 stop('');const mine=ticket;$('stop').disabled=false;
 try{
  await armAudio();const buffer=await decode(asset);if(mine!==ticket)return;
  const node=context.createBufferSource(),gain=context.createGain();node.buffer=buffer;gain.gain.value=asset.gain;node.connect(gain);gain.connect(context.destination);singleSource=node;
  node.onended=()=>{node.disconnect();gain.disconnect();if(mine===ticket){singleSource=null;$('stop').disabled=true;$('audioPrimer').pause();$('status').textContent='Syllabe terminée.';}};
  node.start();$('status').textContent='Syllabe « '+label+' », 175 mots/minute, sans traitement.';
 }catch(error){if(mine===ticket){stop('');$('status').textContent=error.message;}}
}
async function load(){
 try{
  [manifest,bundle]=await Promise.all(['tempo-bench-audio.json','scores/exaudi-nos/bundle.json'].map(url=>fetch(url,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Fichier de test indisponible.');return r.json();})));
  if(manifest.rateWpm!==175)throw Error('Débit des fichiers incorrect.');
  renderTable();$('original').disabled=false;$('stretch').disabled=false;$('status').textContent='Prêt. Les fichiers source sont à 175 mots/minute.';
  for(const [key,asset]of Object.entries(manifest.assets).filter(([key])=>key.includes('R'))){
   const label=asset.code.replaceAll('R','r'),button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label','Écouter la syllabe '+label+' avec r roulé');button.onclick=()=>sample(asset,label);$('rSamples').append(button);
  }
 }catch(error){$('status').textContent=error.message;}
}
$('original').onclick=()=>play('original');$('stretch').onclick=()=>play('stretch');$('stop').onclick=()=>stop();
for(const id of ['passage','tempo','profile','notes'])$(id).addEventListener(id==='tempo'?'input':'change',()=>{stop('Paramètres mis à jour.');renderTable();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',()=>stop());
export const ready=load();
export function getState(){return {loading,currentMode,parameters:parameters(),rows:rows.map(({cue,ratio,outputDuration,overlap})=>({text:cue.text,ratio,outputDuration,overlap})),playback:transport?.state||'stopped'};}

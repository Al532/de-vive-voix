'use strict';
(()=>{
 const $=id=>document.getElementById(id),media=$('recording'),report=$('report');
 let serial=0,current=null;const lines=[];
 function log(message){lines.push(message);report.value=lines.join('\n');report.scrollTop=report.scrollHeight;}
 function result(message){$('result').textContent=message;}
 function currentRun(run){return current===run&&run.id===serial;}
 function noteError(error){return `${error?.name||'Erreur'} : ${error?.message||error}`;}
 function stop(){
  const old=current;current=null;serial++;
  if(old){old.timers.forEach(clearTimeout);old.nodes.forEach(node=>{try{node.stop();node.disconnect();}catch{}});
   if(old.utterance){old.utterance.onend=null;old.utterance.onerror=null;window.speechSynthesis?.cancel();}
   if(old.audio){old.audio.onstatechange=null;try{Promise.resolve(old.audio.close()).catch(()=>{});}catch{}}
  }
  media.onplaying=null;media.onended=null;media.onerror=null;media.pause();
 }
 function begin(number){stop();const run={id:serial,number,timers:[],nodes:[],audio:null,utterance:null};current=run;log(`\nTest ${number}`);result(`Test ${number} en cours…`);return run;}
 function later(run,fn,delay){const timer=setTimeout(()=>{if(currentRun(run))fn();},delay);run.timers.push(timer);return timer;}
 function fail(run,error){if(!currentRun(run))return;log(noteError(error));result(`Test ${run.number} : ${noteError(error)}`);}
 function prepare(run){
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(error){log(`Session audio : ${noteError(error)}`);}
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)throw Error('Synthétiseur indisponible dans ce navigateur.');
  const audio=run.audio=new Audio();
  const snapshot=()=>`état=${audio.state}, horloge=${audio.currentTime.toFixed(3)} s`;
  log(`Création : ${snapshot()}, fréquence=${audio.sampleRate} Hz`);
  audio.onstatechange=()=>{if(currentRun(run))log(`Contexte : ${snapshot()}`);};
  const primer=audio.createBufferSource();primer.buffer=audio.createBuffer(1,1,audio.sampleRate);primer.connect(audio.destination);run.nodes.push(primer);
  primer.onended=()=>{primer.disconnect();if(currentRun(run))log('Amorce silencieuse terminée.');};primer.start(0);
  const ready=audio.state==='running'?Promise.resolve():Promise.resolve(audio.resume());
  // Observe rejection immediately, even while the spoken syllable is pending.
  return ready.then(()=>{if(currentRun(run))log(`Activation : ${snapshot()}`);return true;},error=>{fail(run,error);return false;});
 }
 async function playNote(run,ready){
  if(!await ready||!currentRun(run))return;
  const audio=run.audio;
  try{
   if(audio.state!=='running')await audio.resume();
   if(!currentRun(run))return;
   if(audio.state!=='running')throw Error(`Audio ${audio.state}.`);
   const start=audio.currentTime;
   const node=NoteSynth.schedule(audio,69,start+.025,1,.13,()=>{
    if(!currentRun(run))return;
    log(`Fin de la note : horloge=${audio.currentTime.toFixed(3)} s`);
    result(`Test ${run.number} terminé côté navigateur. As-tu entendu la note ?`);
   });run.nodes.push(node);run.scheduled=true;
   log(`Note programmée : la 440 Hz, 1 s, horloge=${start.toFixed(3)} s`);
   later(run,()=>log(`Horloge après 1,5 s : ${audio.currentTime.toFixed(3)} s (${audio.state})`),1500);
  }catch(error){fail(run,error);}
 }
 function testSynth(withSpeech){
  const run=begin(withSpeech?2:1);
  try{
   const ready=prepare(run);
   later(run,()=>{if(!run.scheduled){log('Aucune note programmée après 8 s.');result(`Test ${run.number} : la note n’a pas démarré. Consulte les détails.`);}},8000);
   if(!withSpeech){void playNote(run,ready);return;}
   if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)throw Error('Synthèse vocale indisponible.');
   const u=run.utterance=new window.SpeechSynthesisUtterance('La');
   const voices=window.speechSynthesis.getVoices?.()||[];
   const voice=voices.find(v=>/^la(?:-|_|$)/i.test(v.lang))||voices.find(v=>/^it(?:-|_|$)/i.test(v.lang));
   u.lang=voice?.lang||'it-IT';if(voice)u.voice=voice;u.rate=.85;
   let finished=false;
   const finish=error=>{if(finished||!currentRun(run))return;finished=true;run.utterance=null;
    log(error?`Erreur de parole : ${error}`:'Fin de parole reçue.');void playNote(run,ready);};
   u.onstart=()=>{if(currentRun(run))log('Début de parole reçu.');};
   u.onend=()=>finish();u.onerror=event=>finish(event.error);
   log(`Parole demandée (${u.lang}).`);window.speechSynthesis.speak(u);
  }catch(error){fail(run,error);}
 }
 $('tone').onclick=()=>testSynth(false);
 $('speechTone').onclick=()=>testSynth(true);
 $('file').onclick=()=>{
  const run=begin(3);
  media.onplaying=()=>{if(currentRun(run)){log('Le lecteur de fichier signale la lecture.');result('Test 3 : le lecteur joue le fichier. Entends-tu la note ?');}};
  media.onended=()=>{if(currentRun(run)){log('Fin du fichier audio.');result('Test 3 terminé côté navigateur. As-tu entendu la note ?');}};
  media.onerror=()=>fail(run,Error(`Fichier audio : code ${media.error?.code||'inconnu'}.`));
  try{media.currentTime=0;log('Lecture du fichier WAV demandée.');Promise.resolve(media.play()).catch(error=>fail(run,error));}catch(error){fail(run,error);}
 };
 $('stop').onclick=()=>{stop();log('Arrêt demandé.');result('Tests arrêtés.');};
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(report.value);result('Journal copié.');}catch{report.focus();report.select();result('Journal sélectionné : utilise « Copier » dans le menu.');}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')$('stop').onclick();});
 window.addEventListener('pagehide',stop);
 log('Diagnostic audio 1 — même synthétiseur que le morceau.');
 log(navigator.userAgent);log(`Audio Session disponible : ${'audioSession' in navigator?'oui':'non'}`);
})();

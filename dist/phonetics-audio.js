/* Cached PCM produced from explicit phonemes, played as ordinary media on iOS. */
(function(){
'use strict';
let manifest=null,failed=false,current=null,serial=0,view=null;
const status=text=>{const el=document.getElementById('audioStatus');if(el)el.textContent=text;};
const highlight=index=>document.querySelectorAll('.syllable').forEach((el,i)=>el.classList.toggle('playing',i===index));
function stop(announce=false){
  if(announce)window.dispatchEvent(new CustomEvent('voice-playback-start',{detail:'stop'}));
  serial++;if(current){current.pause();current.removeAttribute('src');current.load();current=null;}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  highlight(-1);if(announce)status('Lecture arrêtée.');
}
function play(asset,label,index,cues){
  window.dispatchEvent(new CustomEvent('voice-playback-start',{detail:'phonetics'}));
  stop();const ticket=serial;
  const audio=new Audio(asset.url);current=audio;audio.setAttribute('playsinline','');
  audio.onplaying=()=>{if(ticket!==serial)return;status(label);highlight(index??-1);};
  audio.ontimeupdate=()=>{if(ticket!==serial||!cues)return;const cue=cues.find(c=>audio.currentTime>=c.start&&audio.currentTime<c.end);highlight(cue?.index??-1);};
  audio.onended=()=>{if(ticket!==serial)return;highlight(-1);status('Écoute terminée.');current=null;};
  const error=()=>{if(ticket!==serial)return;highlight(-1);status('Lecture impossible. Réessayez avec le bouton Écouter.');};
  audio.onerror=error;status('Chargement du son…');
  audio.play().catch(error);
}
function compare(){
  window.dispatchEvent(new CustomEvent('voice-playback-start',{detail:'phonetics'}));
  stop();const ticket=serial;
  if(!window.speechSynthesis){status('La synthèse de l’appareil est indisponible.');return;}
  const voices=window.speechSynthesis.getVoices();
  const voice=voices.find(v=>/^la(?:[-_]|$)/i.test(v.lang))||voices.find(v=>/^it(?:[-_]|$)/i.test(v.lang));
  if(!voice){status('Aucune voix latine ou italienne disponible sur cet appareil pour la comparaison. Les sons phonétiques restent utilisables.');return;}
  const utterance=new SpeechSynthesisUtterance(view.map(s=>s.text).join(''));
  utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=.8;
  utterance.onstart=()=>{if(ticket===serial)status('Lecture habituelle du mot — '+voice.name+'.');};
  utterance.onend=()=>{if(ticket===serial)status('Comparaison terminée.');};
  utterance.onerror=()=>{if(ticket===serial)status('La voix de l’appareil n’a pas pu terminer la lecture.');};
  window.speechSynthesis.speak(utterance);
}
function refresh(){
  if(!view||!document.getElementById('listenSequence'))return;
  const key=view.map(s=>s.ipa).join('|'),sequence=manifest?.sequences[key];
  const all=document.getElementById('listenSequence');all.disabled=!sequence;
  all.onclick=()=>sequence&&play(sequence,'Lecture des syllabes phonétiques.',null,sequence.cues);
  document.querySelectorAll('[data-listen-syllable]').forEach(button=>{
    const index=Number(button.dataset.listenSyllable),s=view[index],asset=manifest?.syllables[s.ipa];
    button.disabled=!asset;button.onclick=()=>asset&&play(asset,'Syllabe « '+s.text+' ».',index);
  });
  document.querySelectorAll('[data-listen-vowel]').forEach(button=>{
    const index=Number(button.dataset.listenVowel),vowels=(view[index].ipa.match(/[aeiouɛɔɪʊə]/g)||[]),asset=vowels.length===1?manifest?.syllables[vowels[0]]:null;
    button.disabled=!asset;button.onclick=()=>asset&&play(asset,'Voyelle seule de « '+view[index].text+' ».',index);
  });
  document.getElementById('compareVoice').onclick=compare;
  document.getElementById('stopAudio').onclick=()=>stop(true);
  status(failed?'Les fichiers audio n’ont pas pu être chargés. Rechargez la page.':!manifest?'Chargement des sons…':sequence?'Prêt : écoutez le mot syllabe par syllabe ou chaque syllabe séparément.':'Ce découpage n’a pas de séquence audio préparée. Les syllabes disponibles restent écoutables ; une transcription modifiée peut nécessiter de nouveaux sons.');
}
window.PhoneticAudio={stop,mount(syllables){stop();view=syllables;refresh();}};
fetch('phonetics-audio.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(m=>{manifest=m;refresh();}).catch(()=>{failed=true;refresh();});
window.addEventListener('voice-playback-start',e=>{if(e.detail!=='phonetics')stop();});
window.addEventListener('pagehide',()=>stop());
})();

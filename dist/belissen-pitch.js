(function(){
'use strict';
const select=document.getElementById('pitchOccurrence'),player=document.getElementById('pitchPlayer'),info=document.getElementById('pitchInfo'),status=document.getElementById('pitchStatus');
let samples=[],chosen=null,serial=0;
const level=()=>document.getElementById('pitchVoiceLevel').value;
const source=kind=>chosen[(kind==='mixed'||kind==='spoken'?kind+level():kind)+'URL'];
const fmt=(n,d=1)=>n.toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:d});
function pause(){serial++;player.pause();}
function selectSample(){
 pause();chosen=samples[Number(select.value)];player.src=source('mixed');player.load();
 info.textContent='« '+chosen.syllable+' » /'+chosen.ipa+'/ dans « '+chosen.word+' » — '+chosen.part+', mesure '+chosen.measure+', temps '+fmt(chosen.beat)+'. Note : '+chosen.note+' à '+fmt(chosen.targetHz)+' Hz (la = 440 Hz).';
 document.getElementById('pitchMeasured').textContent='Mesure sur la voyelle seule : '+fmt(chosen.measuredHz)+' Hz ; écart '+(chosen.cents>=0?'+':'')+fmt(chosen.cents)+' cents.';
 status.textContent='Prêt : synthé et voix accordée, superposés.';
 for(const button of document.querySelectorAll('[data-pitch-audio]'))button.disabled=false;
}
function start(kind){
 pause();const ticket=serial;player.src=source(kind);player.load();
 const names={mixed:'Synthé avec syllabe accordée à la note.',spoken:'Synthé avec syllabe parlée ordinaire.',synth:'Synthé seul à '+fmt(chosen.targetHz)+' Hz.',comparison:'Note repère → syllabe → voyelle seule.',syllable:'Syllabe « '+chosen.syllable+' ».',vowel:'Voyelle /'+chosen.vowel+'/.',tone:'Note repère à '+fmt(chosen.targetHz)+' Hz.'};
 status.textContent=names[kind];player.play().catch(()=>{if(ticket===serial)status.textContent='Lecture impossible. Réessayez avec le lecteur audio.';});
}
player.addEventListener('play',()=>window.dispatchEvent(new CustomEvent('voice-playback-start',{detail:'pitch'})));
player.addEventListener('error',()=>{if(chosen)status.textContent='Le fichier audio n’a pas pu être chargé. Rechargez la page.';});
window.addEventListener('voice-playback-start',e=>{if(e.detail!=='pitch')pause();});
window.addEventListener('pagehide',pause);
select.addEventListener('change',selectSample);
document.getElementById('pitchVoiceLevel').addEventListener('change',()=>{if(chosen)selectSample();});
for(const button of document.querySelectorAll('[data-pitch-audio]'))button.addEventListener('click',()=>chosen&&start(button.dataset.pitchAudio));
fetch('belissen-pitch.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 samples=data.samples;select.replaceChildren(...samples.map((s,i)=>new Option(s.syllable+' — '+s.note+' · '+fmt(s.targetHz)+' Hz · '+s.part+' · m. '+s.measure,i)));select.disabled=false;selectSample();
}).catch(()=>{status.textContent='Les essais de hauteur n’ont pas pu être chargés. Rechargez la page.';});
})();

'use strict';
const language=document.getElementById('language'),query=document.getElementById('query'),status=document.getElementById('status'),summary=document.getElementById('summary'),results=document.getElementById('results'),resultInfo=document.getElementById('resultInfo'),more=document.getElementById('more');
let master,profile,filtered=[],shown=40,generation=0,activeAudio=null;
const collator=new Intl.NumberFormat('fr-FR'),fmt=n=>collator.format(n),normalize=s=>s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function stopAudio(){if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;activeAudio=null;}}
function noteText(notes){return notes.map(n=>n.includes('/ɥ/')?'Prononciation approchée du son « ui ».':n.includes('/œ̃/')?'La voyelle nasale peut se rapprocher du son « in ».':n.includes('caret')?'Voyelle nasale d’emprunt : interprétation à affiner.':n.includes('liturgical')?'Ajout liturgique inclus indépendamment de sa fréquence.':n).join(' ');}
async function loadProfile(){
 const token=++generation;stopAudio();shown=40;results.replaceChildren();more.hidden=true;query.disabled=true;status.textContent='Chargement des sons de cette langue…';
 try{
  const selected=master.languages.find(p=>p.language===language.value),response=await fetch('catalogue-audio/'+selected.indexUrl,{cache:'no-cache'});
  if(!response.ok)throw new Error('Impossible de lire cette langue.');
  const data=await response.json();if(token!==generation)return;
  profile={...data,base:new URL('catalogue-audio/'+selected.indexUrl,location.href)};
  summary.textContent=fmt(data.entries.length)+' sons · '+(selected.bytes/1e6).toFixed(1).replace('.',',')+' Mo disponibles, chargés seulement à l’écoute.';
  query.disabled=false;status.textContent='Catalogue prêt.';filter();
 }catch(e){if(token===generation)status.textContent=e.message;}
}
function filter(){
 stopAudio();
 const search=normalize(query.value.trim());
 filtered=profile.entries.filter(e=>!search||normalize([e.engineIPA,...e.sourceForms,...e.examples,...(e.liturgicalWords||[])].join(' ')).includes(search));
 shown=40;render();
}
function render(){
 results.replaceChildren();resultInfo.textContent=fmt(filtered.length)+' sons trouvés'+(filtered.length>shown?' ; les '+fmt(shown)+' premiers sont affichés.':'.');
 filtered.slice(0,shown).forEach(e=>{
  const article=document.createElement('article');article.className='sound';
  const description=document.createElement('div');description.className='description';
  const ipa=document.createElement('p');ipa.className='ipa';ipa.textContent='/'+e.engineIPA+'/';description.append(ipa);
  const example=document.createElement('p');example.className='examples';example.textContent=e.examples.length?'Exemples : '+e.examples.join(', '):'Durée : '+e.duration.toFixed(2).replace('.',',')+' seconde';description.append(example);
  if(e.liturgicalWords?.length){const formula=document.createElement('p');formula.className='examples';formula.textContent='Formules : '+e.liturgicalWords.join(', ');description.append(formula);}
  if(e.notes.length){const note=document.createElement('p');note.className='note';note.textContent=noteText(e.notes);description.append(note);}
  const button=document.createElement('button');button.type='button';button.textContent='Écouter';button.setAttribute('aria-label','Écouter '+e.engineIPA+(e.examples.length?', par exemple dans '+e.examples[0]:''));
  const url=new URL(e.url,profile.base);
  button.addEventListener('click',async()=>{
   stopAudio();const audio=new Audio(url.href);activeAudio=audio;status.textContent='Lecture de '+e.engineIPA;button.disabled=true;
   const finish=()=>{button.disabled=false;if(activeAudio===audio){activeAudio=null;status.textContent='Catalogue prêt.';}};
   audio.addEventListener('ended',finish,{once:true});audio.addEventListener('error',()=>{finish();status.textContent='Ce son n’a pas pu être chargé.';},{once:true});audio.addEventListener('pause',()=>{button.disabled=false;},{once:true});
   try{await audio.play();}catch(e){finish();status.textContent='Lecture indisponible : '+e.message;}
  });
  const download=document.createElement('a');download.className='download';download.href=url.href;download.download=e.id+'.wav';download.textContent='Télécharger';download.setAttribute('aria-label','Télécharger le son '+e.engineIPA);
  article.append(description,button,download);results.append(article);
 });
 more.hidden=filtered.length<=shown;
}
language.addEventListener('change',loadProfile);query.addEventListener('input',filter);more.addEventListener('click',()=>{shown+=40;render();});window.addEventListener('pagehide',stopAudio);
(async()=>{try{const response=await fetch('catalogue-audio/index.json',{cache:'no-cache'});if(!response.ok)throw new Error('Impossible de lire le catalogue.');master=await response.json();master.languages.forEach(p=>{const option=document.createElement('option');option.value=p.language;option.textContent=p.title+' — '+fmt(p.entries)+' sons';language.append(option);});language.value='la';language.disabled=false;await loadProfile();}catch(e){status.textContent=e.message;}})();


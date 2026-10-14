'use strict';
const $=id=>document.getElementById(id);
let score=null,groups=[],selected=null,lastReport=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setWords(){
  const part=score.parts[Number($('part').value)], map=new Map();
  for(const w of part.words){
    const key=w.syllables.map(s=>s.text).join('-');
    if(!map.has(key)) map.set(key,{key,occurrences:[]});
    map.get(key).occurrences.push(w);
  }
  groups=[...map.values()];
  $('word').replaceChildren(...groups.map((g,i)=>new Option(g.key+' · '+g.occurrences.length+' occurrence'+(g.occurrences.length>1?'s':''),i)));
  selectWord();
}
function selectWord(){
  selected=groups[Number($('word').value)];
  $('syllables').value=selected.key;$('ipa').value='';
  const first=selected.occurrences[0];
  $('sourceStatus').textContent=score.parts[Number($('part').value)].name+' — première occurrence, mesure '+first.syllables[0].notes[0].measure+'.';
  render();
}
function render(){
  PhoneticAudio.stop();
  try{
    const raw=$('syllables').value.trim(), syllables=raw.split(/[-‐‑–]/).map(s=>s.trim());
    if(/\s/.test(raw)) throw new Error('Essayez un seul mot à la fois, sans espaces.');
    if(!raw||syllables.some(s=>!s)) throw new Error('Saisissez un mot avec des syllabes non vides, par exemple sae-cu-lo-rum.');
    if(raw.length>180||syllables.length>40) throw new Error('Essayez un seul mot à la fois (180 caractères maximum).');
    const original=selected&&raw===selected.key?selected.occurrences[0]:null;
    const result=LatinPhonetics.convert(syllables), input=$('ipa').value.trim();
    const alignment=input?LatinPhonetics.align(result,input):null;
    if(input&&!alignment.normalized) throw new Error('La transcription ne contient aucun son à rapprocher.');
    const issues=[...new Set([...(original?.issues||[]),...result.issues])];
    if(alignment?.distance) issues.push('La transcription ajoutée diffère de la référence ('+alignment.distance+' opération'+(alignment.distance>1?'s':'')+' de rapprochement). La répartition proposée doit être vérifiée.');
    if(alignment?.ambiguous) issues.push('Plusieurs alignements ont le même coût : le découpage phonétique est ambigu.');
    const displayed=result.syllables.map((s,i)=>({...s,ipa:alignment?alignment.syllables[i]:s.ipa}));
    for(const s of displayed) if(!/[aeiouɛɔɪʊə]/.test(s.ipa)) issues.push('Aucune voyelle reconnue dans la proposition pour « '+s.text+' ».');
    lastReport={language:'la',convention:'roman-ecclesiastical-simplified',reviewRequired:true,source:original?{score:score.title,part:score.parts[Number($('part').value)].name,occurrences:selected.occurrences}:null,reference:result,externalTranscription:input||null,alignment,syllables:displayed,issues:[...new Set(issues)],limitations:['Accent tonique non calculé','Ouverture des voyelles simplifiée','Durée et répartition des consonnes à vérifier','Audio parlé eSpeak NG, pas de chant ; sons préparés pour le corpus pilote']};
    $('result').innerHTML='<div class="result-head"><h2>Correspondance proposée</h2><span class="badge '+(issues.length?'warning':'')+'">'+(issues.length?'À vérifier':'Aucun conflit détecté')+'</span></div><p class="transcription">/'+esc(displayed.map(s=>s.ipa||'∅').join('.'))+'/</p>'+
      (issues.length?'<div class="issues">'+[...new Set(issues)].map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>':'<p class="hint">Proposition automatique selon les règles simplifiées ; la prononciation reste à valider.</p>')+
      '<section class="audio-controls" aria-label="Écoute phonétique"><button id="listenSequence" type="button" class="primary" disabled>Tout écouter : syllabes séparées</button><div class="audio-actions"><button id="compareVoice" type="button">Comparer : mot lu par l’appareil</button><button id="stopAudio" type="button">Arrêter</button></div><p id="audioStatus" role="status">Chargement des sons…</p><p class="hint">Voix robotique parlée, générée à partir des phonèmes. Les syllabes sont séparées par une courte pause.</p></section><div class="cards">'+displayed.map((s,i)=>{
        const nucleus=(s.ipa.match(/[aeiouɛɔɪʊə]+/g)||[]).join(' · '),notes=original?.syllables[i]?.notes;
        return '<article class="syllable"><strong>'+esc(s.text)+'</strong><p class="sound">/'+esc(s.ipa||'∅')+'/</p><p class="meta">Voyelle(s) : <mark>'+esc(nucleus||'à vérifier')+'</mark></p>'+(notes?'<p class="meta">'+notes.length+' note'+(notes.length>1?'s':'')+' · m. '+esc(notes[0].measure)+(notes.at(-1).measure!==notes[0].measure?'–'+esc(notes.at(-1).measure):'')+'</p>':'')+(alignment?'<p class="meta">Référence : /'+esc(result.syllables[i].ipa)+'/</p>':'')+'<button type="button" data-listen-syllable="'+i+'" aria-label="Écouter la syllabe '+esc(s.text)+'" disabled>Écouter</button><button type="button" data-listen-vowel="'+i+'" aria-label="Écouter la voyelle seule de '+esc(s.text)+'" disabled>Voyelle seule</button></article>';
      }).join('')+'</div><details><summary>Voir les correspondances lettres → sons</summary><div class="table-wrap"><table><thead><tr><th>Lettres</th><th>Sons</th><th>Syllabe</th><th>Règle</th></tr></thead><tbody>'+result.units.map(u=>'<tr><td>'+esc(u.letters)+'</td><td>'+esc(u.ipa||'∅')+'</td><td>'+esc(syllables[u.syllable])+(u.crossing?' ⚠':'')+'</td><td>'+esc(u.rule)+'</td></tr>').join('')+'</tbody></table></div></details><button id="export" type="button">Télécharger ce rapprochement (JSON)</button>';
    PhoneticAudio.mount(displayed);
    $('export').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='rapprochement-'+(result.word||'latin')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }catch(error){lastReport=null;$('result').replaceChildren(Object.assign(document.createElement('p'),{textContent:error.message,className:'issues'}));}
}
$('analysis').addEventListener('submit',e=>{e.preventDefault();render();});
$('part').addEventListener('change',setWords);$('word').addEventListener('change',selectWord);
$('syllables').addEventListener('input',()=>{PhoneticAudio.stop();$('result').replaceChildren();lastReport=null;$('sourceStatus').textContent='Découpage modifié : relancez le rapprochement.';});
$('ipa').addEventListener('input',()=>{PhoneticAudio.stop();$('result').replaceChildren();lastReport=null;});
render();
fetch('phonetics-score.json').then(r=>{if(!r.ok)throw new Error('Partition indisponible');return r.json();}).then(data=>{
  score=data;
  $('part').replaceChildren(...score.parts.map((p,i)=>new Option(p.name,i)));
  $('part').disabled=false;$('word').disabled=false;setWords();
}).catch(()=>{$('sourceStatus').textContent='La partition n’a pas pu être chargée. Vous pouvez toujours saisir un découpage ci-dessous.';});

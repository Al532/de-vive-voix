'use strict';
const by=id=>document.getElementById(id),labels={la:'latin italien et grec liturgique',fr:'français',it:'italien',de:'allemand','en-US':'anglais américain'};let activeEngine,controller;
function busy(value){for(const id of ['scoreFile','importLanguage'])by(id).disabled=value;for(const id of ['importButton'])by(id).setAttribute('aria-disabled',String(value));by('cancelImport').hidden=!value;}
async function start(file,chosenLanguage){
 if(controller)return;controller=new AbortController();activeEngine=new ImportSpeech.Engine();busy(true);by('importResult').hidden=true;by('importStatus').textContent='Préparation du morceau…';by('importProgress').textContent='Lecture de la partition.';
 try{await PracticeLibrary.open();const bytes=await file.arrayBuffer(),score=await MusicXMLImport.read(file),language=chosenLanguage==='auto'?ImportSpeech.detect(score):chosenLanguage;by('importProgress').textContent='Langue retenue : '+labels[language]+'.';const prepared=await ImportSpeech.prepare(score,language,{engine:activeEngine,signal:controller.signal,progress:text=>{by('importProgress').textContent=text;}});if(controller.signal.aborted)throw new DOMException('Annulé','AbortError');
  const digest=await crypto.subtle.digest('SHA-256',bytes),id=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')+'-'+language,record={id,created:Date.now(),filename:file.name,originalFile:file,...prepared};await PracticeLibrary.save(record);
  let destination='La partition est disponible sur cet appareil.';
  if(CloudLibrary.cutover)try{
   const connected=await CloudLibrary.session();
   if(connected&&!controller.signal.aborted){
    if(document.activeElement===by('cancelImport'))by('importButton').focus();
    by('cancelImport').hidden=true;
    by('importStatus').textContent='Sauvegarde dans ta bibliothèque en ligne…';
    by('importProgress').textContent='';
    await CloudLibrary.transfer(record,{upload:true});
    await PracticeLibrary.remove(id,record);
    destination='La partition est disponible dans ta bibliothèque en ligne.';
   }
  }catch{destination='La partition est enregistrée sur cet appareil. La sauvegarde en ligne pourra être reprise dans Mes partitions.';}
  const result=by('importResult');result.replaceChildren();const detail=document.createElement('p');detail.textContent=score.title+' — '+score.parts.length+' parties conservées, '+score.parts.filter(p=>p.vocal).length+' voix avec paroles, '+(score.starts.length-1)+' mesures, '+score.verseNumbers.length+' couplet'+(score.verseNumbers.length>1?'s':'')+'. Langue : '+labels[language]+'.';result.append(detail);
  const stats=document.createElement('p');stats.textContent=prepared.stats.reused+' sons repris du catalogue ; '+prepared.stats.generated+' sons absents créés et '+prepared.stats.cached+' retrouvés sur cet appareil.';result.append(stats);
  for(const warning of score.warnings){const p=document.createElement('p');p.textContent=warning;result.append(p);}const link=document.createElement('a');link.className='primary';link.href=ScoreNavigation.readerUrl(id);link.textContent='Ouvrir le morceau';result.append(link);result.hidden=false;by('importStatus').textContent=destination;by('importProgress').textContent='';
 }catch(error){by('importStatus').textContent=error.name==='AbortError'?'Préparation annulée.':error.message;by('importProgress').textContent='';}finally{activeEngine.close();activeEngine=null;controller=null;const cancelledFocus=document.activeElement===by('cancelImport');busy(false);if(cancelledFocus)by('importButton').focus();}
}
by('importForm').addEventListener('submit',event=>{event.preventDefault();const file=by('scoreFile').files[0];if(file)void start(file,by('importLanguage').value);});by('cancelImport').addEventListener('click',()=>{controller?.abort();activeEngine?.close();});
window.addEventListener('pagehide',()=>{controller?.abort();activeEngine?.close();});

by('returnButton').addEventListener('click',()=>{controller?.abort();activeEngine?.close();const query=new URLSearchParams(location.search);location.assign(query.has('library')?'bibliotheque.html':ScoreNavigation.readerUrl(query.get('score')||''));});


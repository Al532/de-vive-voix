'use strict';
// Opt-in, local-only diagnostics. No live region, audio, focus change or storage.
if(new URLSearchParams(location.search).get('trace')==='1'){
 const panel=document.getElementById('playbackDebug');
 const output=document.getElementById('playbackTrace');
 const copy=document.getElementById('copyPlaybackTrace');
 const origin=performance.now(),entries=[];
 const record=(event,data={})=>{
  entries.push({ms:Math.round(performance.now()-origin),event,...data});
  if(entries.length>250)entries.shift();
  output.value=JSON.stringify(entries,null,2);
 };
 window.PlaybackDebug={record};panel.hidden=false;
 record('environment',{version:'talkback-focus-2',browser:navigator.userAgent});
 for(const type of ['focusin','focusout','click'])document.addEventListener(type,event=>{
  record(type,{target:event.target?.id||event.target?.tagName,focus:document.activeElement?.id||document.activeElement?.tagName,...(type==='click'?{detail:event.detail}: {})});
 },true);
 document.addEventListener('visibilitychange',()=>record('visibility',{hidden:document.hidden}));
 copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(output.value);document.getElementById('playbackCopyResult').textContent='Journal copié.';}
  catch{output.focus();output.select();document.getElementById('playbackCopyResult').textContent='Sélectionnez et copiez le journal ci-dessous.';}
 };
}

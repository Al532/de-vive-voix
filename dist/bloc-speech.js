(function(root){
'use strict';
function createMap(score,phonetics){
 return score.parts.map(p=>{
  const groups=new Map(),result={};
  p.events.forEach((e,i)=>{if(e.sy&&!e.continued&&!e.ties?.includes('stop')){if(!groups.has(e.wi))groups.set(e.wi,[]);groups.get(e.wi).push({e,i});}});
  for(const list of groups.values()){const converted=phonetics.convert(list.map(x=>x.e.sy));list.forEach((x,j)=>result[x.i]=converted.syllables[j].ipa);}
  let previous='';
  p.events.forEach((e,i)=>{if(result[i])previous=result[i];else if(e.sy&&(e.continued||e.ties?.includes('stop')))result[i]=previous;if(e.pitch===null)previous='';});
  return result;
 });
}
function plan(score,part,bloc,tempo,map){
 const events=score.parts[part].events,spb=60/tempo,cues=[];
 const first=bloc.indices.find(i=>!events[i].grace);
 for(const i of bloc.indices){
  const e=events[i];if(e.pitch===null||e.grace||!e.sy)continue;
  const continued=e.continued||e.ties?.includes('stop')||e.t<bloc.start;
  if(continued&&i!==first)continue;
  let ipa=map[part][i];
  if(continued)ipa=score.continuationMap?.[part]?.[i]||ipa?.replace(/^[^aeiou]+/,'');
  if(!ipa)throw Error('Phonèmes manquants pour '+e.sy);
  const beat=Math.max(bloc.start,e.t);
  cues.push({index:i,ipa,text:e.sy,continued,beat,offset:(beat-bloc.start)*spb});
 }
 return cues.map((c,i)=>({...c,endBeat:i+1<cues.length?cues[i+1].beat:bloc.end,room:((i+1<cues.length?cues[i+1].beat:bloc.end)-c.beat)*spb}));
}
root.BlocSpeech={createMap,plan};
if(typeof module!=='undefined')module.exports=root.BlocSpeech;
})(globalThis);


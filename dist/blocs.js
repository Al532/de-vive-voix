(function(root){
'use strict';
// Adaptive practice blocks preserve the original phrase protocol. The full-piece passage uses the shared timeline.
function measureAt(score,beat){
 const count=score.starts.length-1;
 let lo=0,hi=count-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(score.starts[mid]<=beat)lo=mid;else hi=mid-1;}
 return Math.max(0,Math.min(count-1,lo));
}
function passage(score,part,startMeasure,endMeasure){
 const start=score.starts[startMeasure],end=score.starts[endMeasure+1],events=score.parts[part].events;
 const indices=events.flatMap((e,i)=>e.pitch!==null&&e.t<end&&(e.t+Math.max(e.d,.001)>start||(e.grace&&e.t>=start))?[i]:[]);
 const words=[],seen=new Set();
 for(const i of indices){const e=events[i];if(e.wi==null||!e.word||seen.has(e.wi))continue;seen.add(e.wi);words.push(e.word);}
 return {core:Array.from({length:endMeasure-startMeasure+1},(_,i)=>startMeasure+i),start,end,indices,text:words.join(' '),extensionIndex:null,extensionMeasure:null};
}
function estimatedCells(text){return Array.from(text).length+(text.match(/[A-ZÀ-ÖØ-Þ]/g)||[]).length+(text.match(/\d+/g)||[]).length;}
function buildBlocs(score,part,options={}){
 const target=Number(options.measures??2),cells=options.cells||32,events=score.parts[part].events,starts=score.starts;
 if(!Number.isInteger(target)||target<1||target>8)throw Error('La taille cible doit être comprise entre 1 et 8 mesures.');
 const span=target*2;
 const bar=m=>(starts[m+1]-starts[m])||3;
 const notes=events.map((e,i)=>({...e,i})).filter(e=>e.pitch!==null);
 // A rest of at least two local bars separates vocal phrases, for this voice only.
 const phrases=[];let phrase,release=-Infinity;
 for(const e of notes){if(!phrase||e.t-release>=2*bar(e.m)-1e-8){phrase=[];phrases.push(phrase);}phrase.push(e);release=Math.max(release,e.t+e.d);}
 const result=[];
 for(const [phraseId,ns] of phrases.entries()){
  const active=[...new Set(ns.map(e=>e.m))],phraseEnd=Math.max(...ns.map(e=>e.t+e.d));
  const density=ms=>ns.reduce((sum,e)=>sum+(ms.includes(e.m)?1+(e.sy&&!e.continued&&!e.ties.includes('stop')?2:0):0),0);
  function candidate(at,size){
   const first=active[at],prelude=at===0&&phraseId>0;
   const start=prelude?Math.max(0,ns[0].t-bar(first)):starts[first];
   // Keep the original two-target-bar envelope, including phrase preparation.
   const limit=prelude?starts[Math.min(first+span-1,starts.length-1)]:starts[Math.min(first+span,starts.length-1)];
   const core=active.slice(at,at+size).filter(m=>starts[m]<limit);
   const last=core.at(-1),principal=ns.find(e=>e.m>last&&!e.grace);
   const extension=principal&&principal.t+principal.d<=limit?principal:null;
   const coreNotes=ns.filter(e=>core.includes(e.m));
   const release=Math.max(...coreNotes.map(e=>e.t+e.d));
   let end=extension?extension.t+extension.d:Math.min(starts[last+1],limit);
   // Keep complete sustained notes; at a phrase ending, leave one beat of accompaniment.
   end=Math.max(end,release);
   if(!principal)end=Math.max(release,Math.min(phraseEnd+1,limit,starts.at(-1)));
   const indices=ns.filter(e=>e.t>=start&&e.t<end&&(!extension||e.i<=extension.i)).map(e=>e.i);
   const words=[],seen=new Set();for(const i of indices){const e=events[i];if(e.wi==null||!e.word||seen.has(e.wi))continue;seen.add(e.wi);words.push(e.word);}
   const text=words.join(' '),estimate=estimatedCells(text);
   return {core,start,end,indices,text,density:density(core),estimatedCells:estimate,overBudget:estimate>cells,extensionMeasure:extension?extension.m:null,extensionIndex:extension?extension.i:null};
  }
  for(let at=0;at<active.length;){
   let size=target,c=candidate(at,size);if(c.density>12*size||c.overBudget){while(size>1&&(c.density>12*size||c.overBudget))c=candidate(at,--size);}
   else if(active.length-at>=target*2&&c.density<=2*target){const four=candidate(at,target*2);if(four.density<=5*target&&!four.overBudget)c=four;}
   const previous=result.at(-1);
   // An isolated closing note already heard as the previous extension needs no new block.
   if(previous&&c.indices.every(i=>previous.indices.includes(i))){
    previous.core.push(...c.core.filter(m=>!previous.core.includes(m)));
    previous.end=Math.max(previous.end,c.end);previous.extensionIndex=null;previous.extensionMeasure=null;
   }else result.push(c);
   at+=c.core.length;
  }
 }
 for(const c of result){c.adaptive=true;c.targetMeasures=target;c.attackEnd=c.extensionIndex!==null?events[c.extensionIndex].t:null;c.allowAttackAtEnd=c.extensionIndex!==null;}
 return result;
}
function withLeadIn(score,part,bloc,enabled){
 const first=bloc.core[0],coreStart=score.starts[first];
 const firstVocal=score.parts[part].events.find(e=>e.pitch!==null)?.m;
 const start=enabled&&first!==firstVocal?Math.min(bloc.start,score.starts[Math.max(0,first-1)]):bloc.start;
 if(start===bloc.start)return {...bloc,leadInMeasure:start<coreStart?measureAt(score,start):null};
 const events=score.parts[part].events;
 const indices=events.flatMap((e,i)=>e.pitch!==null&&e.t<bloc.end&&e.t+Math.max(e.d,.001)>start&&
  (bloc.extensionIndex===null||i<=bloc.extensionIndex)?[i]:[]);
 const words=[],seen=new Set();
 for(const i of indices){const e=events[i];if(e.wi==null||!e.word||seen.has(e.wi))continue;seen.add(e.wi);words.push(e.word);}
 return {...bloc,start,indices,text:words.join(' '),leadInMeasure:measureAt(score,start)};
}
// Restore the common closing note while keeping fixed core bars and IDs.
// Do not jump into a new vocal phrase across a rest of two local bars.
function withEnding(score,part,range){
 if(range.adaptive)return range;
 const events=score.parts[part].events,coreStart=score.starts[range.core[0]],coreEnd=score.starts[range.core.at(-1)+1];
 const coreNotes=events.filter(e=>e.pitch!==null&&!e.grace&&e.t<coreEnd&&e.t+e.d>coreStart);
 if(!coreNotes.length)return range;
 const release=Math.max(...coreNotes.map(e=>e.t+e.d));
 const following=events.map((e,i)=>({...e,i})).find(e=>e.pitch!==null&&!e.grace&&e.t>=coreEnd-1e-8);
 const bar=following?(score.starts[following.m+1]-score.starts[following.m]||3):3;
 const extension=following&&following.t-release<2*bar-1e-8?following:null;
 const end=Math.min(score.starts.at(-1),Math.max(range.end,release,extension?extension.t+extension.d:range.end));
 const indices=events.flatMap((e,i)=>e.pitch!==null&&e.t<end&&e.t+Math.max(e.d,.001)>range.start&&
  (extension?i<=extension.i:e.t<coreEnd-1e-8)?[i]:[]);
 const words=[],seen=new Set();
 for(const i of indices){const e=events[i];if(e.wi==null||!e.word||seen.has(e.wi))continue;seen.add(e.wi);words.push(e.word);}
 return {...range,end,indices,text:words.join(' '),extensionIndex:extension?.i??null,extensionMeasure:extension?.m??null,
  attackEnd:extension?extension.t:coreEnd,allowAttackAtEnd:!!extension};
}
function mergedNotes(score){
 return score.parts.flatMap((p,part)=>{
  const merged=[],held=new Map();
  for(const e of p.events){
   if(e.pitch===null)continue;
   const lane=(e.staff||'1')+':'+(e.voice||'1')+':'+e.pitch,last=held.get(lane);
   if(e.ties?.includes('stop')&&last&&last.pitch===e.pitch&&Math.abs(last.t+last.d-e.t)<.001)last.d+=e.d;
   else{const note={...e,d:e.d||.12,part};merged.push(note);held.set(lane,note);}
  }
  return merged;
 });
}
root.BlocModel={buildBlocs,passage,withLeadIn,withEnding,measureAt,mergedNotes,estimatedCells};
if(typeof module!=='undefined')module.exports=root.BlocModel;
})(globalThis);

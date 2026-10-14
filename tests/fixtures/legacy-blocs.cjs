(function(root){
// Estimate only: actual braille translation depends on the reader's table.
function estimatedCells(text){return Array.from(text).length+(text.match(/[A-ZÀ-ÖØ-Þ]/g)||[]).length+(text.match(/\d+/g)||[]).length;}
function buildBlocs(score,part,options={}){
 const cells=options.cells||32,events=score.parts[part].events,starts=score.starts;
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
   // Four actual bars maximum, including the instrumental lead-in and rests.
   const limit=prelude?starts[Math.min(first+3,starts.length-1)]:starts[Math.min(first+4,starts.length-1)];
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
   let c=candidate(at,2);if(c.density>24||c.overBudget)c=candidate(at,1);
   else if(active.length-at>=4&&c.density<=4){const four=candidate(at,4);if(four.density<=10&&!four.overBudget)c=four;}
   const previous=result.at(-1);
   // An isolated closing note already heard as the previous extension needs no new block.
   if(previous&&c.indices.every(i=>previous.indices.includes(i))){
    previous.core.push(...c.core.filter(m=>!previous.core.includes(m)));
    previous.end=Math.max(previous.end,c.end);previous.extensionIndex=null;previous.extensionMeasure=null;
   }else result.push(c);
   at+=c.core.length;
  }
 }
 return result;
}
root.BlocModel={buildBlocs,estimatedCells};if(typeof module!=='undefined')module.exports=root.BlocModel;
})(globalThis);

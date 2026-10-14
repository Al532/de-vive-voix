/* MusicXML partwise/timewise reader. Notes remain in quarter-note time. */
(function(root){
'use strict';
const kids=(n,name)=>Array.from(n?.childNodes||[]).filter(c=>c.nodeType===1&&(!name||c.localName===name||c.nodeName===name));
const child=(n,name)=>kids(n,name)[0], txt=(n,name,fallback='')=>child(n,name)?.textContent?.trim()??fallback;
const num=(n,name,fallback=0)=>{const v=Number(txt(n,name,String(fallback)));if(!Number.isFinite(v))throw Error('Valeur MusicXML invalide : '+name);return v;};
function documentXML(text){
 if(typeof text!=='string'||text.length>20*1024*1024)throw Error('Partition trop volumineuse (20 Mo maximum après décompression).');
 if(/<!ENTITY\s/i.test(text))throw Error('Les déclarations d’entités XML ne sont pas prises en charge.');
 const doc=new root.DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length||!doc.documentElement)throw Error('Le fichier XML est mal formé.');return doc;
}
function parse(text,{filename='Partition'}={}){
 const doc=documentXML(text),r=doc.documentElement,type=r.localName||r.nodeName;
 if(!['score-partwise','score-timewise'].includes(type))throw Error('Ce fichier ne contient pas une partition MusicXML.');
 const defs=kids(child(r,'part-list'),'score-part'), allMeasures=kids(r,'measure');
 const raw=defs.map(def=>{
  const id=def.getAttribute('id');let measures;
  if(type==='score-partwise')measures=kids(kids(r,'part').find(p=>p.getAttribute('id')===id),'measure');
  else measures=allMeasures.map(m=>({node:kids(m,'part').find(p=>p.getAttribute('id')===id),outer:m}));
  return {id,name:/^(P\d+|Part\d+)$/i.test(txt(def,'part-name',id))?(txt(child(def,'score-instrument'),'instrument-name')||txt(def,'part-name',id)):txt(def,'part-name',id),measures,events:[]};
 });
 const count=Math.max(0,...raw.map(p=>p.measures.length));
 if(!raw.length||!count)throw Error('La partition ne contient aucune partie ou mesure.');
 if(raw.length>128||count>10000)throw Error('Partition trop grande : 128 parties et 10 000 mesures maximum.');
 const lengths=Array(count).fill(0),meters=Array(count),labels=Array(count),implicit=Array(count), controls=Array.from({length:count},()=>({})),tempos=[],warnings=new Set(),languages=new Set();let eventCount=0;
 for(const [pi,p] of raw.entries()){
  let divisions=1,meter=[4,4],transpose=0,staffTranspose={},octaves={},ending=null;
  for(let mi=0;mi<count;mi++){
   let m=p.measures[mi],outer=m?.outer||m;m=m?.node||m;
   if(!m)continue;
   if(pi===0){labels[mi]=outer.getAttribute('number')||String(mi+1);implicit[mi]=outer.getAttribute('implicit')==='yes';}
   let cursor=0,previous=0,max=0;
   for(const el of kids(m)){
    const tag=el.localName||el.nodeName;
    if(tag==='attributes'){
     if(child(el,'divisions')){divisions=num(el,'divisions',1);if(divisions<=0)throw Error('Divisions musicales invalides.');}
     const time=child(el,'time');if(time&&child(time,'beats')){const beats=kids(time,'beats').reduce((s,b)=>s+b.textContent.split('+').reduce((a,x)=>a+Number(x),0),0),unit=num(time,'beat-type',4);if(beats>0&&unit>0)meter=[beats,unit];}
     for(const tr of kids(el,'transpose')){const value=num(tr,'chromatic')+12*num(tr,'octave-change');if(tr.getAttribute('number'))staffTranspose[tr.getAttribute('number')]=value;else transpose=value;}
    }else if(tag==='backup'||tag==='forward'){
     cursor+=(tag==='backup'?-1:1)*num(el,'duration')/divisions;if(cursor<-.0001)throw Error('Retour musical avant le début de la mesure.');if(cursor<0)cursor=0;max=Math.max(max,cursor);
    }else if(tag==='direction'){
     const sound=child(el,'sound'),offset=num(el,'offset')/divisions;
     if(sound?.hasAttribute('tempo')){const value=Number(sound.getAttribute('tempo'));if(value>0&&value<=1000)tempos.push({m:mi,beat:cursor+offset,tempo:value});}
     const dtype=child(el,'direction-type'),met=child(dtype,'metronome');
     if(!sound?.hasAttribute('tempo')&&met){const units={whole:4,half:2,quarter:1,eighth:.5,'16th':.25},unit=units[txt(met,'beat-unit')],dots=kids(met,'beat-unit-dot').length,value=num(met,'per-minute');if(unit&&value>0)tempos.push({m:mi,beat:cursor+offset,tempo:value*unit*(2-2**(-dots))});}
     if(sound&&['dacapo','dalsegno','tocoda','fine'].some(a=>sound.hasAttribute(a)))warnings.add('Les renvois Da capo, Dal segno et Coda sont lus dans l’ordre écrit ; les reprises ordinaires sont jouées.');
     const shift=child(dtype,'octave-shift');if(shift){const staff=txt(el,'staff','1'),direction=shift.getAttribute('type'),oct=Number(shift.getAttribute('size')||8)===15?24:12;octaves[staff]=direction==='stop'?0:direction==='down'?oct:-oct;}
    }else if(tag==='barline'){
     {const end=child(el,'ending');if(end&&end.getAttribute('type')==='start')ending=(end.getAttribute('number')||'1').split(/[, ]+/).map(Number).filter(Boolean);if(ending)controls[mi].ending=ending;
      const repeat=child(el,'repeat');if(repeat){if(repeat.getAttribute('direction')==='forward')controls[mi].forward=true;else{controls[mi].backward=true;controls[mi].times=Math.max(controls[mi].times||2,Math.min(8,Math.max(2,Number(repeat.getAttribute('times')||2))));}}
      if(end&&['stop','discontinue'].includes(end.getAttribute('type')))ending=null;
     }
    }else if(tag==='note'){
     const grace=!!child(el,'grace'),chord=!!child(el,'chord'),d=grace?0:num(el,'duration')/divisions,beat=chord?previous:cursor;
     if(d<0)throw Error('Durée de note invalide.');
     const staff=txt(el,'staff','1'),voice=txt(el,'voice','1'),pit=child(el,'pitch');let pitch=null;
     if(pit){const semitones={C:0,D:2,E:4,F:5,G:7,A:9,B:11},step=txt(pit,'step');if(!(step in semitones))throw Error('Hauteur musicale invalide.');pitch=(num(pit,'octave',4)+1)*12+semitones[step]+num(pit,'alter')+(staffTranspose[staff]??transpose)+(octaves[staff]||0);}
     if(child(el,'unpitched'))warnings.add('Les percussions sans hauteur sont conservées comme silences dans cet import.');
     const lyrics=kids(el,'lyric').map(l=>{const lang=l.getAttribute('xml:lang')||kids(l,'text').map(t=>t.getAttribute('xml:lang')).find(Boolean)||'';if(lang)languages.add(lang);return {number:l.getAttribute('number')||l.getAttribute('name')||'1',text:kids(l).filter(c=>['text','elision'].includes(c.localName||c.nodeName)).map(c=>(c.localName||c.nodeName)==='elision'?(c.textContent||' '):c.textContent).join('').trim(),kind:txt(l,'syllabic','single'),extend:!!child(l,'extend'),lang};});
     const ties=[...new Set([...kids(el,'tie'),...kids(child(el,'notations'),'tied')].map(t=>t.getAttribute('type')).filter(t=>['start','stop'].includes(t)))];
     p.events.push({m:mi,beat,d,pitch,sy:'',word:'',continued:false,grace,ties,staff,voice,lyrics});
     if(++eventCount>300000)throw Error('Trop de notes dans cette partition.');
     if(!chord){previous=cursor;cursor+=d;}max=Math.max(max,beat+d,cursor);
    }
   }
   lengths[mi]=Math.max(lengths[mi],max);if(!meters[mi]||pi===0)meters[mi]=meter.slice();
  }
 }
 for(let mi=0;mi<count;mi++){const meter=meters[mi]||[4,4],nominal=meter[0]*4/meter[1];if(!implicit[mi])lengths[mi]=Math.max(lengths[mi],nominal);if(!lengths[mi])lengths[mi]=nominal;}
 // Expand bounded forward/backward repeats and numbered endings once, shared by every part.
 let route=[],at=0,start=0,pass=1,steps=0;const visits=new Map();
 while(at<count){if(++steps>count*16)throw Error('Reprises trop complexes ou circulaires.');const c=controls[at];if(c.forward){start=at;pass=visits.get(at)||1;}
  if(!c.ending||c.ending.includes(pass))route.push(at);
  if(c.backward){const key=start+':'+at,n=visits.get(key)||1;if(n<c.times){visits.set(key,n+1);visits.set(start,n+1);pass=n+1;at=start;continue;}pass=n;}
  at++;
 }
 const starts=[0];for(const source of route)starts.push(starts.at(-1)+lengths[source]);
 let expandedCount=0;const parts=[];
 for(const p of raw){
  const localVerses=[...new Set(p.events.flatMap(e=>e.lyrics.map(l=>l.number)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  for(const e of p.events)for(const l of e.lyrics){l.originalNumber=l.number;const explicit=/^(?:\d+)$/.test(l.number)?l.number:l.number.match(/(?:verse|couplet)(\d+)/i)?.[1];l.number=explicit||String(localVerses.indexOf(l.number)+1);}
  const vocalLanes=[...new Set(p.events.filter(e=>e.lyrics.some(l=>l.text)).map(e=>e.staff+':'+e.voice))];
  const allLanes=[...new Set(p.events.filter(e=>e.pitch!==null).map(e=>e.staff+':'+e.voice))],split=vocalLanes.length>0&&allLanes.length>1;
  const lanes=split?[...new Set(p.events.map(e=>e.staff+':'+e.voice))]:['all'];
  for(const lane of lanes){const events=[];for(const [mi,source] of route.entries())for(const original of p.events.filter(e=>e.m===source&&(lane==='all'||e.staff+':'+e.voice===lane)))events.push({...original,lyrics:original.lyrics.map(l=>({...l})),m:mi,sourceMeasure:labels[source],t:starts[mi]+original.beat});
   expandedCount+=events.length;if(expandedCount>300000)throw Error('Trop de notes après le développement des reprises.');
   if(events.some(e=>e.pitch!==null))parts.push({id:p.id+(split?':'+lane:''),name:p.name+(split?' — voix '+(lanes.indexOf(lane)+1):''),vocal:events.some(e=>e.lyrics.some(l=>l.text)),events,words:[]});
  }
 }
 if(!parts.length)throw Error('La partition ne contient aucune note avec une hauteur.');
 tempos.sort((a,b)=>a.m-b.m||a.beat-b.beat);
 const title=txt(r,'movement-title')||txt(child(r,'work'),'work-title')||filename.replace(/\.(mxl|xml|musicxml)$/i,''),composer=kids(child(r,'identification'),'creator').filter(c=>c.getAttribute('type')==='composer').map(c=>c.textContent.trim()).join(', ');
 const score={title,composer,parts,starts,meters:route.map(i=>meters[i]||[4,4]),measureLabels:route.map(i=>labels[i]),tempo:tempos[0]?.tempo||80,tempoChanges:tempos,warnings:[...warnings],languages:[...languages],format:'MusicXML',verseNumbers:[...new Set(parts.flatMap(p=>p.events.flatMap(e=>e.lyrics.filter(l=>l.text).map(l=>l.number))))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))};
 if(route.length>count)score.warnings.push('Les reprises sont dépliées : '+route.length+' mesures lues pour '+count+' mesures écrites. Les numéros du lecteur suivent l’ordre de lecture.');
 if(new Set(tempos.map(t=>t.tempo)).size>1)score.warnings.push('Le tempo de départ est repris ; le réglage du lecteur reste commun à tout le morceau.');
 if(!score.verseNumbers.length)score.verseNumbers=['1'];applyVerse(score,score.verseNumbers[0]);return score;
}
function applyVerse(score,number){
 score.verse=number;
 for(const p of score.parts){
  let group=[],last=null,wi=0;const words=[];
  const finish=()=>{if(!group.length)return;const word=group.map(e=>e.sy).join('');for(const e of group){e.word=word;e.wi=wi;}words.push(word);wi++;group=[];};
  for(const e of p.events){e.sy='';e.word='';e.continued=false;delete e.wi;const lyric=e.lyrics?.find(l=>l.number===number),sy=lyric?.text||'';
   if(sy){if(['begin','single'].includes(lyric.kind))finish();e.sy=sy;group.push(e);last=e;if(['end','single'].includes(lyric.kind))finish();}
   else if(e.pitch!==null&&last&&(lyric?.extend||e.ties.includes('stop')||e.t>=last.t)){e._last=last;e.continued=true;}
   else if(e.pitch===null){finish();last=null;}
  }
  finish();for(const e of p.events){if(e._last){e.sy=e._last.sy;e.word=e._last.word;e.wi=e._last.wi;delete e._last;}}p.words=words;
 }
 return score;
}
function decode(bytes){const head=Array.from(bytes.slice(0,250),b=>String.fromCharCode(b)).join(''),declared=head.match(/encoding\s*=\s*[\"']([^\"']+)/i)?.[1],encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':declared||'utf-8';try{return new TextDecoder(encoding).decode(bytes);}catch{throw Error('Encodage XML non pris en charge : '+encoding);}}
async function read(file){
 if(file.size>20*1024*1024)throw Error('Le fichier dépasse 20 Mo.');const bytes=new Uint8Array(await file.arrayBuffer());let text;
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  if(!root.fflate)throw Error('Décompression indisponible.');
  let total=0,entries=0;const files=root.fflate.unzipSync(bytes,{filter:entry=>{if(!/\.(xml|musicxml)$/i.test(entry.name))return false;total+=entry.originalSize;if(++entries>64||total>20*1024*1024)throw Error('Le contenu XML du fichier dépasse 20 Mo ou 64 fichiers.');return true;}}),decoder={decode};
  let filename;const container=files['META-INF/container.xml'];if(container){const manifest=documentXML(decoder.decode(container));const roots=Array.from(manifest.getElementsByTagName('rootfile'));filename=roots.find(n=>n.getAttribute('media-type')==='application/vnd.recordare.musicxml+xml')?.getAttribute('full-path')||roots[0]?.getAttribute('full-path');}
  filename=filename||Object.keys(files).find(n=>!n.startsWith('META-INF/')&&/\.(xml|musicxml)$/i.test(n));if(!filename||!files[filename])throw Error('La partition annoncée dans le fichier MXL est absente.');text=decoder.decode(files[filename]);
 }else text=decode(bytes);
 return parse(text,{filename:file.name});
}
root.MusicXMLImport={parse,read,applyVerse,documentXML};if(typeof module!=='undefined')module.exports=root.MusicXMLImport;
})(globalThis);

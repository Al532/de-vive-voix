(function(root){
'use strict';
// Every onset and cursor uses AudioContext time, never elapsed wall-clock time.
class PracticeTransport{
 constructor(options){
  Object.assign(this,options);
  this.timer=null;this.nodes=new Set();this.state='stopped';this.generation=0;
  // AudioBufferSourceNodes are single-use. Reuse voice slots, not source nodes;
  // keep four slots and wait for one rather than steal a syllable still sounding.
  this.syllableVoices=Array.from({length:4},()=>({source:null,endTime:-Infinity}));
  this.cuePlayback=new Map();this.resumeOffsets=new Map();
  this.setTimer=(fn,ms)=>(options.setTimer||setTimeout)(fn,ms);this.clearTimer=id=>(options.clearTimer||clearTimeout)(id);
 }
 playbackPosition(){
  return this.state==='playing'?this.anchorBeat+Math.max(0,this.audio.currentTime-this.anchorTime)*this.tempo/60:this.cursor;
 }
 position(){
  if(!this.range)return 0;
  return Math.max(this.range.start,Math.min(this.range.end,this.playbackPosition()));
 }
 cancelSources(){
  this.generation++;this.clearTimer(this.timer);this.timer=null;
  for(const node of this.nodes){try{node.stop();}catch{}}
  this.nodes.clear();
  for(const voice of this.syllableVoices){voice.source=null;voice.endTime=-Infinity;}
 }
 notify(){this.onPosition?.(this.position());this.onState?.(this.state);}
 configure(range,cues,part,tempo){
  this.cancelSources();this.range=range;this.cues=cues;this.part=part;this.tempo=tempo;
  this.cuePlayback=new Map();this.resumeOffsets=new Map();
  this.cursor=range.start;this.state='stopped';this.notify();
 }
 play(){if(!this.range)return;if(this.state!=='paused'&&this.position()>=this.range.end)this.cursor=this.range.start;this.restart('playing',this.playbackPosition(),this.state==='paused');}
 restart(state,position=this.playbackPosition(),preserveSpeech=false){
  // Retain actual sample progress, including voices waiting for a free slot.
  // Score time alone cannot describe an onset delayed by pool saturation.
  const offsets=preserveSpeech?new Map(this.resumeOffsets):new Map();
  if(preserveSpeech&&this.state==='playing')for(const [i,p]of this.cuePlayback)offsets.set(i,{
   asset:p.asset,offset:p.offset+Math.max(0,Math.min(p.duration,this.audio.currentTime-p.start))
  });
  this.resumeOffsets=offsets;
  this.cancelSources();this.cursor=position;this.state=state;
  this.cuePlayback=new Map();
  if(state==='playing'){
   this.anchorBeat=position;this.anchorTime=this.audio.currentTime+.035;
   this.playbackEndTime=Math.max(this.anchorTime,this.time(this.range.end));
   this.scheduledNotes=new Set();this.scheduledCues=new Set();this.tick();
  }
  this.notify();
 }
 pause(){if(this.state==='playing')this.restart('paused',this.playbackPosition(),true);}
 stop(){if(this.range)this.restart('stopped',this.range.start);}
 seek(beat){if(!this.range)return;const state=this.state==='playing'?'playing':'paused';this.restart(state,Math.max(this.range.start,Math.min(this.range.end,beat)));}
 setTempo(value){
  const position=this.playbackPosition();this.tempo=value;
  if(this.range)this.restart(this.state,position,true);
 }
 chooseAsset(cue){
  const variants=this.assets[cue.ipa]||[];
  // Keep speech at its natural rate. Short notes may overlap full syllables;
  // legacy manifests without speed metadata use their longest recording.
  return variants.find(v=>v.speed===1)||variants.reduce((best,v)=>!best||v.duration>best.duration?v:best,null);
 }
 time(beat){return this.anchorTime+(beat-this.anchorBeat)*60/this.tempo;}
 track(node){
  if(!node)return;
  this.nodes.add(node);
  const previous=node.onended;
  node.onended=()=>{this.nodes.delete(node);previous?.();};
 }
 tick(){
  if(this.state!=='playing')return;
  const mine=this.generation,position=this.position(),from=this.anchorBeat;
  try{
   const until=this.playbackPosition()+.25*this.tempo/60,spb=60/this.tempo;
   for(let i=0;i<this.notes.length;i++){
    if(this.scheduledNotes.has(i))continue;
    const e=this.notes[i];
    if(this.range.attackEnd!=null&&(this.range.allowAttackAtEnd?e.t>this.range.attackEnd+1e-8:e.t>=this.range.attackEnd-1e-8)){
     this.scheduledNotes.add(i);continue;
    }
    const a=Math.max(e.t,this.range.start,from),b=Math.min(e.t+e.d,this.range.end);
    if(b<=a){this.scheduledNotes.add(i);continue;}
    if(a>until)continue;
    this.scheduledNotes.add(i);
    const start=Math.max(this.audio.currentTime,this.time(a));
    const end=this.time(b);if(end<=start)continue;
    this.track(this.scheduleTone(e,start,end-start,e.part===this.part?.13:.014));
   }
   for(let i=0;i<this.cues.length;i++){
    if(this.scheduledCues.has(i))continue;
    const cue=this.cues[i],saved=this.resumeOffsets.get(i),resumed=saved&&!(saved.offset===0&&cue.beat>from)?saved:null,natural=this.chooseAsset(cue);
    let asset=resumed?.asset||natural;
    if(!asset)throw Error('Son de syllabe indisponible.');
    if(!resumed&&asset&&this.fitAsset&&Math.max(cue.beat,from)<=until)asset=this.fitAsset(cue,asset,this.buffers.get(asset.url),this.tempo);
    const buffer=this.buffers.get(asset.url);
    if(!buffer)throw Error('Son de syllabe non chargé.');
    const assetEnd=cue.beat+buffer.duration/spb;
    if(resumed?resumed.offset>=buffer.duration:assetEnd<=from){this.scheduledCues.add(i);continue;}
    const a=Math.max(cue.beat,from);
    if(a>until)continue;
    this.scheduledCues.add(i);
    let start=Math.max(this.audio.currentTime,this.time(a));
    const offset=resumed?resumed.offset:Math.max(0,(a-cue.beat)*spb+(start-this.time(a)));
    const duration=buffer.duration-offset;
    if(duration<=0)continue;
    let voice=this.syllableVoices.find(v=>v.endTime<=start);
    if(!voice){voice=this.syllableVoices.reduce((earliest,v)=>v.endTime<earliest.endTime?v:earliest);start=voice.endTime;}
    const source=this.audio.createBufferSource(),gain=this.audio.createGain();
    source.buffer=buffer;gain.gain.value=asset.gain;
    source.connect(gain);gain.connect(this.audio.destination);
    voice.source=source;voice.endTime=start+duration;
    this.cuePlayback.set(i,{asset,start,offset,duration});
    this.playbackEndTime=Math.max(this.playbackEndTime,voice.endTime);
    source.onended=()=>{source.disconnect();gain.disconnect();if(voice.source===source){voice.source=null;voice.endTime=-Infinity;}};
    source.start(start,offset);this.track(source);
   }
   if(mine!==this.generation||this.state!=='playing')return;
   if(position>=this.range.end&&this.audio.currentTime>=this.playbackEndTime){
    this.cancelSources();this.cursor=this.range.end;this.state='ended';this.notify();return;
   }
   this.onPosition?.(position);
   this.timer=this.setTimer(()=>this.tick(),25);
  }catch(error){
   this.restart('paused',position);this.onError?.(error);
  }
 }
}
root.PracticeTransport=PracticeTransport;
if(typeof module!=='undefined')module.exports=PracticeTransport;
})(globalThis);



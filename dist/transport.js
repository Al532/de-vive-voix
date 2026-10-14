(function(root){
'use strict';
// Every onset and cursor uses AudioContext time, never elapsed wall-clock time.
class PracticeTransport{
 constructor(options){
  Object.assign(this,options);
  this.timer=null;this.nodes=new Set();this.state='stopped';this.generation=0;
  this.setTimer=(fn,ms)=>(options.setTimer||setTimeout)(fn,ms);this.clearTimer=id=>(options.clearTimer||clearTimeout)(id);
 }
 position(){
  if(!this.range)return 0;
  const beat=this.state==='playing'?this.anchorBeat+Math.max(0,this.audio.currentTime-this.anchorTime)*this.tempo/60:this.cursor;
  return Math.max(this.range.start,Math.min(this.range.end,beat));
 }
 cancelSources(){
  this.generation++;this.clearTimer(this.timer);this.timer=null;
  for(const node of this.nodes){try{node.stop();}catch{}}
  this.nodes.clear();
 }
 notify(){this.onPosition?.(this.position());this.onState?.(this.state);}
 configure(range,cues,part,tempo){
  this.cancelSources();this.range=range;this.cues=cues;this.part=part;this.tempo=tempo;
  this.cursor=range.start;this.state='stopped';this.notify();
 }
 play(){if(!this.range)return;if(this.position()>=this.range.end)this.cursor=this.range.start;this.restart('playing');}
 restart(state,position=this.position()){
  this.cancelSources();this.cursor=position;this.state=state;
  if(state==='playing'){
   this.anchorBeat=position;this.anchorTime=this.audio.currentTime+.035;
   this.scheduledNotes=new Set();this.scheduledCues=new Set();this.tick();
  }
  this.notify();
 }
 pause(){if(this.state==='playing')this.restart('paused');}
 stop(){if(this.range)this.restart('stopped',this.range.start);}
 seek(beat){if(!this.range)return;const state=this.state==='playing'?'playing':'paused';this.restart(state,Math.max(this.range.start,Math.min(this.range.end,beat)));}
 setTempo(value){
  const position=this.position();this.tempo=value;
  if(this.range)this.restart(this.state,position);
 }
 chooseAsset(cue){
  const room=(cue.endBeat-cue.beat)*60/this.tempo;
  const variants=this.assets[cue.ipa]||[];
  // If a syllable lands just before a strict bar boundary, clip the shortest
  // recording at the boundary rather than extending the block into another bar.
  return variants.find(v=>v.duration<=room-.012)||variants.at(-1);
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
  if(position>=this.range.end){
   this.cancelSources();this.cursor=this.range.end;this.state='ended';this.notify();return;
  }
  try{
   const until=position+.25*this.tempo/60,spb=60/this.tempo;
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
    const cue=this.cues[i],asset=this.chooseAsset(cue);
    if(!asset)throw Error('Son de syllabe indisponible.');
    const assetEnd=Math.min(cue.endBeat,cue.beat+asset.duration/spb,this.range.end);
    if(assetEnd<=from){this.scheduledCues.add(i);continue;}
    const a=Math.max(cue.beat,from);
    if(a>until)continue;
    this.scheduledCues.add(i);
    const buffer=this.buffers.get(asset.url);
    if(!buffer)throw Error('Son de syllabe non chargé.');
    const start=Math.max(this.audio.currentTime,this.time(a)),offset=Math.max(0,(a-cue.beat)*spb+(start-this.time(a)));
    const duration=Math.min(buffer.duration-offset,(cue.endBeat-cue.beat)*spb-offset,this.time(this.range.end)-start);
    if(duration<=0)continue;
    const source=this.audio.createBufferSource(),gain=this.audio.createGain();
    source.buffer=buffer;gain.gain.value=asset.gain;
    source.connect(gain);gain.connect(this.audio.destination);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(start,offset,duration);this.track(source);
   }
   if(mine!==this.generation||this.state!=='playing')return;
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



import {SoundTouch} from './vendor/soundtouch.mjs';

export const profiles={short:{sequence:20,seek:8,overlap:4},medium:{sequence:40,seek:12,overlap:8},long:{sequence:60,seek:16,overlap:12}};
export function plan(duration,room,cap=Infinity){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(room)||room<=0||(cap!==Infinity&&!Number.isFinite(cap))||cap<1)throw Error('Paramètres audio invalides.');
 const needed=Math.max(1,duration/room),ratio=Math.min(cap,needed),outputDuration=duration/ratio;
 return {ratio,needed,outputDuration,overlap:Math.max(0,outputDuration-room),capped:needed>cap+1e-6};
}
export function stretchMono(samples,sampleRate,ratio,profile='medium'){
 if(!(samples instanceof Float32Array)||!samples.length||sampleRate<8000||!Number.isFinite(ratio)||ratio<1||!profiles[profile])throw Error('Paramètres de traitement invalides.');
 if(ratio===1)return samples.slice();
 const settings=profiles[profile],sound=new SoundTouch();sound.tempo=ratio;sound.pitch=1;sound.rate=1;
 sound.stretch.setParameters(sampleRate,settings.sequence,settings.seek,settings.overlap);sound.stretch.quickSeek=false;
 // Flush the last processing window with silence, rather than lose a final consonant.
 const flushSeconds=Math.max(.3,(settings.sequence+settings.seek+settings.overlap)*ratio/1000);
 const padding=Math.ceil(sampleRate*flushSeconds),input=new Float32Array((samples.length+padding)*2);
 for(let i=0;i<samples.length;i++)input[2*i]=input[2*i+1]=samples[i];
 sound.inputBuffer.putSamples(input,0,input.length/2);sound.process();
 const count=sound.outputBuffer.frameCount,stereo=new Float32Array(count*2);sound.outputBuffer.receiveSamples(stereo,count);
 const target=Math.ceil(samples.length/ratio);if(count<target)throw Error('Fin de syllabe non produite.');
 let last=0;for(let i=0;i<count;i++)if(Math.abs(stereo[2*i])>80/32768)last=i;
 // Exact target duration when possible. Keep a small audible tail if the WSOLA
 // alignment extends it: report the real overlap instead of clipping the sound.
 const length=Math.max(target,Math.min(count,last+1+Math.ceil(sampleRate*.004)));
 const output=new Float32Array(length);for(let i=0;i<length;i++)output[i]=stereo[2*i];
 sound.clear();return output;
}

// Cache by exact source and requested ratio. Resumes keep their processed asset.
export function createFitter(context,buffers){
 const cache=new Map();let serial=0;
 return (cue,asset,input,tempo)=>{
  const room=(cue.endBeat-cue.beat)*60/tempo,{ratio}=plan(input.duration,room);
  if(ratio===1)return asset;
  const key=asset.url+'|'+ratio;
  if(!cache.has(key)){
   const pcm=stretchMono(input.getChannelData(0),input.sampleRate,ratio,'medium');
   const output=context.createBuffer(1,pcm.length,input.sampleRate);output.getChannelData(0).set(pcm);
   const fitted={...asset,url:'fitted:'+asset.url+':'+(++serial),duration:output.duration};
   buffers.set(fitted.url,output);cache.set(key,fitted);
  }
  return cache.get(key);
 };
}

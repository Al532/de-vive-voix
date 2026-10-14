'use strict';
// Shared by the practice player and the device diagnostic: exactly the same
// oscillator, output level and envelope are exercised in both places.
globalThis.NoteSynth={
 schedule(audio,pitch,start,duration,volume=.13,onended=()=>{}){
  if(pitch===null||duration<=0)return null;
  const oscillator=audio.createOscillator(),gain=audio.createGain();
  oscillator.type='triangle';oscillator.frequency.value=440*2**((pitch-69)/12);
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(volume,start+.012);
  gain.gain.setValueAtTime(volume*.7,start+Math.max(.014,duration-.025));
  gain.gain.linearRampToValueAtTime(0,start+duration+.02);
  oscillator.connect(gain);gain.connect(audio.destination);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();onended();};
  oscillator.start(start);oscillator.stop(start+duration+.035);
  return oscillator;
 }
};

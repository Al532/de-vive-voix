"""Shorten spoken syllables without changing pitch, for scheduling on score attacks."""
import json,subprocess,wave,array,math
from pathlib import Path
base=Path(__file__).parent/'dist';source=json.loads((base/'phonetics-audio.json').read_text());result={}
for ipa,item in source['syllables'].items():
 variants=[]
 for speed in [1,1.25,1.5,2,3,4]:
  path=Path(item['url'])
  if speed!=1:
   path=path.with_name(path.stem+'-tempo'+str(speed)+'.wav')
   subprocess.run(['ffmpeg','-v','error','-y','-i',str(base/item['url']),'-af','atempo='+str(speed),str(base/path)],check=True)
  with wave.open(str(base/path)) as w:
   samples=array.array('h',w.readframes(w.getnframes()));duration=len(samples)/w.getframerate();rms=math.sqrt(sum(x*x for x in samples)/len(samples))/32768
  variants.append({'url':str(path),'duration':duration,'speed':speed,'gain':min(.6,.03/max(rms,.001))})
 result[ipa]=variants
(base/'bloc-speech-audio.json').write_text(json.dumps(result,ensure_ascii=False))
print(len(result),'phonetic units with pitch-preserving duration variants')

"""Use one 175 WPM recording per syllable; tempo fitting happens during playback."""
import json, math, wave, array
from pathlib import Path
base=Path(__file__).parent/'dist'
source=json.loads((base/'phonetics-audio.json').read_text())
assert source['rateWpm']==175
result={}
for ipa,item in source['syllables'].items():
 with wave.open(str(base/item['url'])) as wav:
  samples=array.array('h',wav.readframes(wav.getnframes()))
  rms=math.sqrt(sum((x/32768)**2 for x in samples)/len(samples))
 result[ipa]=[{**item,'code':item.get('code',item['mnemonic']),'speed':1,'rateWpm':175,'gain':min(2,.035/rms)}]
(base/'bloc-speech-audio.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(len(result),'phonetic units with one recording at 175 WPM')

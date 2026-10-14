"""Pitch trials from real MusicXML occurrences; local espeak-ng PCM, no pitch shifting."""
import ctypes as C,json,math,shutil,subprocess,tempfile,wave,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
from scipy.signal import find_peaks
import espeakng_loader as loader
BASE=Path(__file__).parent;OUT=BASE/'dist/belissen-pitch';OUT.mkdir(exist_ok=True)
score=json.loads((BASE/'dist/score.json').read_text()); audio=json.loads((BASE/'dist/phonetics-audio.json').read_text())
js="""const e=require('./dist/phonetics-engine.js'),s=require('./dist/score.json');let out=[];s.parts.forEach((p,pi)=>{if(!p.vocal)return;const groups=new Map();p.events.forEach((n,i)=>{if(n.sy&&!n.continued){if(!groups.has(n.wi))groups.set(n.wi,[]);groups.get(n.wi).push({n,i});}});for(const rows of groups.values()){let result=e.convert(rows.map(x=>x.n.sy));rows.forEach((x,j)=>out.push({...x.n,eventIndex:x.i,partIndex:pi,partName:p.name,ipa:result.syllables[j].ipa}));}});console.log(JSON.stringify(out));"""
rows=json.loads(subprocess.check_output(['node','-e',js],cwd=BASE));rows=[r for r in rows if r['pitch'] is not None and not r['grace']]
def pick(name,selector):return selector([r for r in rows if r['partName']==name])
samples=[pick('voix 4',lambda r:min(r,key=lambda e:e['pitch'])),pick('voix 3 (solo)',lambda r:min(r,key=lambda e:e['pitch'])),pick('voix 2',lambda r:min(r,key=lambda e:e['pitch'])),pick('voix 3',lambda r:next(e for e in r if e['sy']=='sae')),next(e for e in rows if e['sy']=='ci'),pick('voix 1',lambda r:min(r,key=lambda e:e['pitch'])),pick('voix 1',lambda r:next(e for e in r if e['sy']=='tu')),pick('voix 1',lambda r:max(r,key=lambda e:e['pitch']))]
samples.sort(key=lambda e:e['pitch'])
with zipfile.ZipFile(BASE/'dist/Belissen.mxl') as z: xml=ET.fromstring(z.read('score.xml'))
xmlparts=xml.findall('part');names={'C':'do','D':'ré','E':'mi','F':'fa','G':'sol','A':'la','B':'si'}
T=tempfile.TemporaryDirectory();data=Path(T.name)/'espeak-ng-data';shutil.copytree(loader.get_data_path(),data)
lib=loader.load_library();lib.espeak_Initialize.argtypes=[C.c_int,C.c_int,C.c_char_p,C.c_int];lib.espeak_SetVoiceByName.argtypes=[C.c_char_p];lib.espeak_Synth.argtypes=[C.c_char_p,C.c_size_t,C.c_uint,C.c_int,C.c_uint,C.c_uint,C.c_void_p,C.c_void_p]
RATE=lib.espeak_Initialize(2,0,str(data).encode(),0);chunks=[]
@C.CFUNCTYPE(C.c_int,C.POINTER(C.c_short),C.c_int,C.c_void_p)
def cb(s,n,_):
 if s and n:chunks.append(C.string_at(s,n*2))
 return 0
lib.espeak_SetSynthCallback(cb)
def synth(code):
 chunks.clear();b=('[[ '+code+' ]]').encode();assert lib.espeak_Synth(b,len(b)+1,0,1,0,0x101,None,None)==0
 lib.espeak_Synchronize();y=np.frombuffer(b''.join(chunks),dtype=np.int16).copy();active=np.where(abs(y.astype(float))>80)[0];assert len(active)
 pad=int(.025*RATE);return y[max(0,active[0]-pad):min(len(y),active[-1]+pad+1)]
def measure(y):
 # Unconstrained autocorrelation over central voiced frames, 70–1100 Hz.
 window=int(.09*RATE);values=[]
 for center in np.arange(.3,.71,.08):
  mid=int(len(y)*center);segment=y[max(0,mid-window//2):mid+window//2].astype(float)
  if len(segment)!=window:continue
  segment-=segment.mean()
  if np.sqrt(np.mean(segment**2))<150:continue
  ac=np.correlate(segment,segment,'full')[window-1:]/np.arange(window,0,-1)
  peaks,_=find_peaks(ac);peaks=[p for p in peaks if RATE/1100<p<RATE/70]
  if not peaks:continue
  best=max(ac[p] for p in peaks);p=next(p for p in peaks if ac[p]>.94*best)
  if ac[p]/ac[0]<.65:continue
  d=.5*(ac[p-1]-ac[p+1])/(ac[p-1]-2*ac[p]+ac[p+1]);values.append(RATE/(p+d))
 assert len(values)>=3,('No stable voiced frames',values)
 return float(np.median(values)),len(values)
def save(name,y):
 with wave.open(str(OUT/(name+'.wav')),'wb') as w:w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(y.astype('<i2').tobytes())
 return 'belissen-pitch/'+name+'.wav'
result=[]
for index,r in enumerate(samples):
 n=xmlparts[r['partIndex']].findall('measure/note')[r['eventIndex']];pitch=n.find('pitch');assert pitch is not None
 midi=(int(pitch.findtext('octave'))+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[pitch.findtext('step')]+int(pitch.findtext('alter','0'));assert midi==r['pitch'];assert n.findtext('lyric/text')==r['sy']
 hz=440*2**((midi-69)/12);setting=round(hz+9)
 voice='fixed'+str(setting);(data/'voices'/voice).write_text(f'name {voice}\nlanguage it\npitch {setting} {setting}\nflutter 0\nroughness 0\n')
 assert lib.espeak_SetVoiceByName(voice.encode())==0
 lib.espeak_SetParameter(1,120,0);lib.espeak_SetParameter(3,50,0)
 code=audio['syllables'][r['ipa']]['mnemonic'];syllable=synth(code)
 vowel=next(c for c in r['ipa'] if c in 'aeiou');vowelpcm=synth("'"+vowel+':')
 measured,frames=measure(vowelpcm);cents=1200*math.log2(measured/hz);assert abs(cents)<10,(r['sy'],hz,measured,cents)
 # A pure reference tone, separated from the syllable, never mixed over it.
 t=np.arange(int(.45*RATE))/RATE;tone=.22*np.sin(2*np.pi*hz*t);fade=int(.015*RATE);tone[:fade]*=np.linspace(0,1,fade);tone[-fade:]*=np.linspace(1,0,fade);tone=(tone*32767).astype(np.int16)
 silence=np.zeros(int(.25*RATE),dtype=np.int16);comparison=np.concatenate([tone,silence,syllable,silence,vowelpcm])
 # Sustained triangle as in the practice synth. Voice enters after 120 ms.
 def mixture(voice_pcm,level_db):
  lead=int(.12*RATE);length=max(int(.9*RATE),lead+len(voice_pcm)+int(.18*RATE));times=np.arange(length)/RATE
  tri=sum(((-1)**((h-1)//2))*np.sin(2*np.pi*h*hz*times)/(h*h) for h in range(1,min(41,int((RATE/2)/hz)),2))*(8/np.pi**2)
  tri*=.30;edge=int(.015*RATE);tri[:edge]*=np.linspace(0,1,edge);tri[-edge:]*=np.linspace(1,0,edge)
  v=voice_pcm.astype(float)/32768;rms=np.sqrt(np.mean(v*v));target=np.sqrt(np.mean(tri*tri))*10**(level_db/20)
  mix=tri.copy();mix[lead:lead+len(v)]+=v*(target/max(rms,1e-6));mix/=max(1,np.max(abs(mix))/.95)
  return (mix*32767).astype(np.int16), (tri*32767).astype(np.int16)
 with wave.open(str(BASE/'dist'/audio['syllables'][r['ipa']]['url'])) as w: spoken_pcm=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').copy()
 stem='sample-'+str(index+1);mixes={}
 for level,db in [('Soft',-9),('Present',-3)]:
  mixed,triangle=mixture(syllable,db);mixes['mixed'+level+'URL']=save(stem+'-mixed-'+level.lower(),mixed)
  spoken_mix,_=mixture(spoken_pcm,db);mixes['spoken'+level+'URL']=save(stem+'-spoken-'+level.lower(),spoken_mix)
 mixes['synthURL']=save(stem+'-synth',triangle)
 stem='sample-'+str(index+1);acc={-2:'𝄫',-1:'♭',0:'',1:'♯',2:'𝄪'}[int(pitch.findtext('alter','0'))]
 item={'id':index+1,'part':r['partName'],'measure':xmlparts[r['partIndex']].findall('measure')[r['m']].get('number'),'beat':r['beat']+1,'eventIndex':r['eventIndex'],'syllable':r['sy'],'word':r['word'],'ipa':r['ipa'],'vowel':vowel,'midi':midi,'note':names[pitch.findtext('step')]+acc,'scientificOctave':int(pitch.findtext('octave')),'targetHz':hz,'measuredHz':measured,'cents':cents,'measurementFrames':frames,'voicePitchSetting':setting,'syllableURL':save(stem,syllable),'vowelURL':save(stem+'-vowel',vowelpcm),'comparisonURL':save(stem+'-compare',comparison),'toneURL':save(stem+'-tone',tone)}
 item.update(mixes);result.append(item);print(item['part'],'m.',item['measure'],item['syllable'],item['note'],round(hz,2),'Hz →',round(measured,2),'Hz',round(cents,1),'cents')
manifest={'referenceA':440,'method':'eSpeak NG, constant custom voice pitch, flutter and roughness disabled; calibrated integer setting round(targetHz+9); no resampling','measurement':'Median autocorrelation F0 of 90 ms central frames of the isolated vowel, unconstrained 70–1100 Hz; not an intelligibility assessment','duration':'Natural synthesized syllable duration; score rhythm not reproduced','mixture':'Band-limited triangle at target Hz; syllable starts 120 ms later; voice RMS -9 dB (Soft) or -3 dB (Present) relative to synth RMS before common peak limiting; pitched and ordinary spoken variants','samples':result}
(BASE/'dist/belissen-pitch.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))

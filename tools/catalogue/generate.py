"""Generate and verify phoneme-controlled eSpeak NG WAV assets, without system installation."""
import argparse,ctypes as C,hashlib,json,sys,time,wave
from pathlib import Path
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')
P=argparse.ArgumentParser();P.add_argument('--runtime',type=Path,required=True);P.add_argument('--selection',type=Path,required=True);P.add_argument('--output',type=Path,required=True);P.add_argument('--limit',type=int,default=0)
A=P.parse_args();sys.path.insert(0,str(A.runtime.resolve()))
import espeakng_loader
class EventID(C.Union):_fields_=[('number',C.c_int),('name',C.c_char_p),('string',C.c_char*8)]
class Event(C.Structure):
 _fields_=[('type',C.c_int),('uid',C.c_uint),('textpos',C.c_int),('length',C.c_int),('audiopos',C.c_int),('sample',C.c_int),('data',C.c_void_p),('id',EventID)]
L=espeakng_loader.load_library()
L.espeak_Initialize.argtypes=[C.c_int,C.c_int,C.c_char_p,C.c_int];L.espeak_Initialize.restype=C.c_int
L.espeak_SetVoiceByName.argtypes=[C.c_char_p];L.espeak_SetParameter.argtypes=[C.c_int,C.c_int,C.c_int]
L.espeak_Synth.argtypes=[C.c_char_p,C.c_size_t,C.c_uint,C.c_int,C.c_uint,C.c_uint,C.c_void_p,C.c_void_p]
L.espeak_Info.argtypes=[C.POINTER(C.c_char_p)];L.espeak_Info.restype=C.c_char_p
RATE=L.espeak_Initialize(2,0,espeakng_loader.get_data_path().encode(),3)
assert RATE==22050,RATE
ENGINE=L.espeak_Info(None).decode()
chunks=[];events_ipa=[];callback_errors=[]
@C.CFUNCTYPE(C.c_int,C.POINTER(C.c_short),C.c_int,C.POINTER(Event))
def callback(samples,count,events):
 try:
  if samples and count:chunks.append(C.string_at(samples,count*2))
  if events:
   i=0
   while events[i].type!=0 and i<10000:
    if events[i].type==7:
     phone=bytes(events[i].id.string).decode('utf8')
     if phone:events_ipa.append(phone)
    i+=1
 except Exception as e:callback_errors.append(str(e));return 1
 return 0
L.espeak_SetSynthCallback(callback)
def synth(code):
 chunks.clear();events_ipa.clear();callback_errors.clear()
 b=('[[ '+code+' ]]').encode('utf8')
 status=L.espeak_Synth(b,len(b)+1,0,1,0,0x101,None,None);L.espeak_Synchronize()
 if status!=0 or callback_errors:raise RuntimeError((code,status,callback_errors))
 samples=np.frombuffer(b''.join(chunks),dtype='<i2')
 if not len(samples) or not events_ipa:raise RuntimeError(('silent or unrecognized phoneme input',code,events_ipa))
 active=np.flatnonzero(np.abs(samples.astype(np.int32))>80)
 if not len(active):raise RuntimeError(('inaudible phoneme input',code))
 pad=int(RATE*.025);samples=samples[max(0,int(active[0])-pad):min(len(samples),int(active[-1])+pad+1)].copy()
 if len(samples)<int(RATE*.02):raise RuntimeError(('unexpectedly short audio',code,len(samples)))
 return samples.tobytes(),''.join(events_ipa),float(np.sqrt(np.mean(samples.astype(np.float64)**2))),int(np.abs(samples.astype(np.int32)).max())
OUT=A.output;OUT.mkdir(parents=True,exist_ok=True)
summary=json.loads((A.selection/'summary.json').read_text(encoding='utf8'))
global_index={'schemaVersion':1,'catalogVersion':'1.0.0','engine':{'name':'eSpeak NG','version':ENGINE,'loader':'espeakng-loader 0.2.4','sampleRate':RATE,'channels':1,'sampleWidth':2,'rateWpm':145,'inputMode':'explicit phoneme mnemonics','pitchMode':'natural spoken intonation'},'languages':[],'sourceFiles':summary['sourceFiles'],'scopeNotes':['Coverage is measured on source corpus syllable occurrences, not whole scores.','French, Italian, German and Latin samples carry an isolated-syllable demonstration accent; English retains source lexical stress.','The Latin profile also includes Greek liturgical formulas pronounced in the Roman Latin tradition.','English data and voice are American English.','Pronunciation variants remain subject to refinement.'],'liturgicalWordsUrl':'v1/liturgical-words.json'}
audit={'engine':global_index['engine'],'files':0,'bytes':0,'seconds':0,'notes':{},'profiles':[]}
started=time.time()
for profile in summary['profiles']:
 lang=profile['language'];source=json.loads((A.selection/(lang+'.json')).read_text(encoding='utf8'));entries=source['entries']
 if A.limit:entries=entries[:A.limit]
 assert L.espeak_SetVoiceByName(source['voice'].encode())==0,lang
 assert L.espeak_SetParameter(1,145,0)==0
 folder=OUT/'v1'/lang;audio_dir=folder/'sons';audio_dir.mkdir(parents=True,exist_ok=True)
 result=[];note_count=0;bytes_count=0;durations=[];seen=set()
 for i,e in enumerate(entries,1):
  assert e['id'] not in seen,e['id'];seen.add(e['id'])
  samples,ipa,rms,peak=synth(e['mnemonic'])
  dest=audio_dir/(e['id']+'.wav')
  with wave.open(str(dest),'wb') as w:w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(samples)
  # Independently reopen the exact saved WAV.
  with wave.open(str(dest),'rb') as w:
   assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,RATE)
   assert w.getnframes()*2==len(samples)
  record={**e,'engineIPA':ipa,'url':'sons/'+dest.name,'duration':len(samples)/2/RATE,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'peak':peak,'rms':round(rms,2)}
  result.append(record);bytes_count+=record['bytes'];durations.append(record['duration'])
  if e['notes']:note_count+=1
  if i%500==0:print('GENERATED',lang,i,'/',len(entries),flush=True)
 public={k:v for k,v in source.items() if k!='entries'};public['entries']=result;public['engine']=global_index['engine']
 (folder/'index.json').write_text(json.dumps(public,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 detail={'language':lang,'title':source['title'],'voice':source['voice'],'entries':len(result),'bytes':bytes_count,'indexUrl':'v1/'+lang+'/index.json','coverage':source['selection']['coverage'],'selection':source['selection'],'meanDuration':sum(durations)/len(durations),'entriesWithNotes':note_count}
 global_index['languages'].append(detail);audit['profiles'].append(detail);audit['files']+=len(result);audit['bytes']+=bytes_count;audit['seconds']+=sum(durations);audit['notes'][lang]=note_count
 print('PROFILE_READY',json.dumps(detail,ensure_ascii=False),flush=True)
(OUT/'v1/liturgical-words.json').write_text((A.selection/'liturgical-words.json').read_text(encoding='utf8'),encoding='utf8')
(OUT/'index.json').write_text(json.dumps(global_index,ensure_ascii=False,indent=2),encoding='utf8')
audit['elapsedSeconds']=round(time.time()-started,2);audit['allFilesReopened']=True
(OUT/'verification.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print('CATALOGUE_READY',json.dumps(audit,ensure_ascii=False),flush=True)


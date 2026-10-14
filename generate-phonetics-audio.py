"""Reproducible phoneme-controlled PCM assets. pip install espeakng-loader==0.2.4"""
import ctypes as C, hashlib,json,subprocess,wave,array,tempfile,re
from pathlib import Path
import espeakng_loader
BASE=Path(__file__).parent; OUT=BASE/'dist/phonetics-audio'; OUT.mkdir(exist_ok=True)
lib=espeakng_loader.load_library()
lib.espeak_Initialize.argtypes=[C.c_int,C.c_int,C.c_char_p,C.c_int]
lib.espeak_SetVoiceByName.argtypes=[C.c_char_p]
lib.espeak_Synth.argtypes=[C.c_char_p,C.c_size_t,C.c_uint,C.c_int,C.c_uint,C.c_uint,C.c_void_p,C.c_void_p]
RATE=lib.espeak_Initialize(2,0,espeakng_loader.get_data_path().encode(),0)
assert RATE>0 and lib.espeak_SetVoiceByName(b'it')==0
lib.espeak_SetParameter(1,145,0)
chunks=[]
@C.CFUNCTYPE(C.c_int,C.POINTER(C.c_short),C.c_int,C.c_void_p)
def callback(samples,count,events):
    if samples and count: chunks.append(C.string_at(samples,count*2))
    return 0
lib.espeak_SetSynthCallback(callback)
MAP={'tʃ':'tS','dʒ':'dZ','ts':'ts','dz':'dz','ɡ':'g','ʃ':'S','ɲ':'n^','ɛ':'E','ɔ':'O',**{x:x for x in 'aeioubptdkfvszmnlrjw'}}
MAP['r']='r/'  # explicit alveolar trill; bare r is English approximant in raw phoneme mode
lib.espeak_SetPhonemeTrace.argtypes=[C.c_int,C.c_void_p]
libc=C.CDLL(None);libc.fopen.argtypes=[C.c_char_p,C.c_char_p];libc.fopen.restype=C.c_void_p
libc.fflush.argtypes=[C.c_void_p];libc.fclose.argtypes=[C.c_void_p]
def mnemonic(ipa):
    result=[];i=0;stressed=False
    while i<len(ipa):
        token=next((t for t in sorted(MAP,key=len,reverse=True) if ipa.startswith(t,i)),None)
        if token is None: raise ValueError('Unsupported phoneme '+ipa[i:])
        if token in 'aeiouɛɔ' and not stressed: result.append("'");stressed=True
        result.append(MAP[token]);i+=len(token)
    return ''.join(result)
def save(name,pcm):
    dest=OUT/(name+'.wav')
    with wave.open(str(dest),'wb') as w:
        w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(pcm)
    return 'phonetics-audio/'+dest.name
pcm_cache={}; manifest={'engine':'eSpeak NG (espeakng-loader 0.2.4)','mode':'explicit phoneme input; Italian sound inventory','rate':RATE,'syllables':{},'sequences':{}}
raw=subprocess.check_output(['node','-e',"const e=require('./dist/phonetics-engine.js'),s=require('./dist/phonetics-score.json');console.log(JSON.stringify(s.parts.flatMap(p=>p.words.map(w=>e.convert(w.syllables.map(s=>s.text)).syllables.map(s=>s.ipa)))))"],cwd=BASE)
sequences=json.loads(raw)
for ipa in sorted({p for seq in sequences for p in seq}|set('aeiou')|{re.sub(r'^[^aeiou]+','',p) for seq in sequences for p in seq}):
    chunks.clear(); code=mnemonic(ipa); data=('[[ '+code+' ]]').encode()
    trace=tempfile.NamedTemporaryFile();fp=libc.fopen(trace.name.encode(),b'w');lib.espeak_SetPhonemeTrace(2,fp)
    assert lib.espeak_Synth(data,len(data)+1,0,1,0,0x101,None,None)==0
    lib.espeak_Synchronize();libc.fflush(fp);lib.espeak_SetPhonemeTrace(0,None);libc.fclose(fp)
    spoken=Path(trace.name).read_text().strip();trace.close()
    normalized=spoken.replace('ˈ','').replace('ˌ','').replace(' ','')
    assert normalized==ipa, (ipa,spoken,code)
    samples=array.array('h',b''.join(chunks))
    # Trim only near-silent outside edges; keep 25 ms around consonants.
    active=[i for i,x in enumerate(samples) if abs(x)>80]
    assert active,ipa
    pad=int(RATE*.025);start=max(0,active[0]-pad);end=min(len(samples),active[-1]+pad+1)
    pcm=samples[start:end].tobytes();pcm_cache[ipa]=pcm
    name='s-'+hashlib.sha256(ipa.encode()).hexdigest()[:12]
    manifest['syllables'][ipa]={'url':save(name,pcm),'duration':len(pcm)/2/RATE,'mnemonic':code,'engineIPA':spoken}
for seq in sequences:
    key='|'.join(seq)
    if key in manifest['sequences']:continue
    pcm=b'';cues=[]
    for i,ipa in enumerate(seq):
        cues.append({'index':i,'start':len(pcm)/2/RATE,'end':(len(pcm)+len(pcm_cache[ipa]))/2/RATE})
        pcm+=pcm_cache[ipa]
        if i<len(seq)-1:pcm+=b'\0\0'*int(RATE*.18)
    manifest['sequences'][key]={'url':save('w-'+hashlib.sha256(key.encode()).hexdigest()[:12],pcm),'cues':cues,'duration':len(pcm)/2/RATE}
(BASE/'dist/phonetics-audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(len(manifest['syllables']),'syllabes/voyelles et',len(manifest['sequences']),'séquences audio générées par phonèmes.')

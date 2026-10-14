"""Independent complete-file verification for the prepared catalogue."""
import argparse,hashlib,json,sys,wave
from pathlib import Path
import numpy as np
P=argparse.ArgumentParser();P.add_argument('path',type=Path);A=P.parse_args();root=A.path.resolve()
master=json.loads((root/'index.json').read_text(encoding='utf8'));total=0;summary=[]
for lang in master['languages']:
 idxpath=root/lang['indexUrl'];idx=json.loads(idxpath.read_text(encoding='utf8'));entries=idx['entries'];seen=set();native=set();notes=0;count=0
 assert len(entries)==lang['entries']
 assert idx['selection']['coverage']>=.99
 for e in entries:
  assert e['id'] not in seen;seen.add(e['id']);native.add(e['mnemonic'])
  path=(idxpath.parent/e['url']).resolve();assert path.is_relative_to(root)
  raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==e['sha256']
  with wave.open(str(path),'rb') as w:
   assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==22050
   n=w.getnframes();pcm=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.int32)
   assert abs(n/22050-e['duration'])<1e-8
   assert len(pcm)>441 and np.max(np.abs(pcm))>80
   assert e['engineIPA']
  if e['notes']:notes+=1
  count+=1
 assert count==len(list((idxpath.parent/'sons').glob('*.wav')))
 summary.append({'language':lang['language'],'verified':count,'notes':notes});total+=count
 if lang['language']=='la':
  words=json.loads((root/master['liturgicalWordsUrl']).read_text(encoding='utf8'))
  required=['Kyrie','Christe','eleison','Hagios','Agios','Theos','ischyros','athanatos','himas','imas']
  assert all(any(w['text']==r for w in words) for r in required)
  for word in words:
   for syll in word['syllables']:assert syll['mnemonic'] in native,(word['text'],syll)
assert total==11625,total
print(json.dumps({'ok':True,'verifiedWavFiles':total,'profiles':summary,'liturgicalFormulasResolved':True},ensure_ascii=False))


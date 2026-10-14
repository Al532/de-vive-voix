import zipfile,xml.etree.ElementTree as E,json,shutil
from pathlib import Path
base=Path(__file__).parent
source=base/'dist/Belissen.mxl'
if not source.exists(): shutil.copy('/workspace/scratch/f31e921555f3/upload/01-Gloria-Patri-et-Filio-Belissen.mxl',source)
r=E.fromstring(zipfile.ZipFile(source).read('score.xml'))
parts=[]; lengths=[0]*108; meters=[]
for sp in r.findall('part-list/score-part'):
 p=r.find("part[@id='%s']"%sp.get('id')); div=1; meter=[3,4]; events=[]; lastly=None; group=[]; words=[]
 for mi,m in enumerate(p.findall('measure')):
  cur=0; prev=0
  for el in m:
   if el.tag=='attributes':
    div=int(el.findtext('divisions',str(div)))
    if el.find('time') is not None: meter=[int(el.findtext('time/beats')),int(el.findtext('time/beat-type'))]
   elif el.tag in ('backup','forward'):cur+=(-1 if el.tag=='backup' else 1)*int(el.findtext('duration'))/div
   elif el.tag=='note':
    grace=el.find('grace') is not None; duration=int(el.findtext('duration','0'))/div
    start=prev if el.find('chord') is not None else cur
    pitch=el.find('pitch'); midi=None
    if pitch is not None: midi=(int(pitch.findtext('octave'))+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[pitch.findtext('step')]+int(pitch.findtext('alter','0'))
    ly=el.find('lyric'); sy=ly.findtext('text','') if ly is not None else ''; kind=ly.findtext('syllabic','single') if ly is not None else ''
    ev={'m':mi,'beat':start,'d':duration,'pitch':midi,'sy':sy,'word':'','continued':False,'grace':grace,'ties':[x.get('type') for x in el.findall('tie')]}
    if sy:
     lastly=ev
     if kind in ('begin','single'):group=[]
     group.append(ev)
     if kind in ('end','single'):
      word=''.join(x['sy'] for x in group); words.append(word)
      for x in group:x['word']=word;x['wi']=len(words)-1
      group=[]
    elif midi is not None and lastly is not None:
     ev['_ly']=lastly;ev['continued']=True
    elif midi is None:lastly=None
    events.append(ev)
    if el.find('chord') is None:prev=cur;cur+=duration
  lengths[mi]=max(lengths[mi],cur,meter[0]*4/meter[1])
  if len(parts)==0:meters.append(meter[:])
 for ev in events:
  if '_ly' in ev:
   ly=ev.pop('_ly');ev.update(sy=ly['sy'],word=ly['word'],wi=ly.get('wi',0))
 parts.append({'name':sp.findtext('part-name'),'vocal':any(e['sy'] for e in events),'events':events,'words':words})
starts=[0]
for n in lengths:starts.append(starts[-1]+n)
for p in parts:
 for e in p['events']:e['t']=starts[e['m']]+e['beat']
data={'title':'Gloria Patri et Filio','composer':'Belissen','parts':parts,'starts':starts,'meters':meters}
(base/'dist/score.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
assert len(parts)==8 and len(starts)==109
print('8 parties, 108 mesures,',sum(len(p['events']) for p in parts),'événements')

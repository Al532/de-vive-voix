"""Select reproducible syllable audio candidates. Corpora remain outside the Site."""
import argparse,collections,csv,hashlib,io,json,re,sys,unicodedata,zipfile
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
P=argparse.ArgumentParser();P.add_argument('--corpora',type=Path,required=True);P.add_argument('--output',type=Path,required=True)
A=P.parse_args();BASE=A.corpora;OUT=A.output;OUT.mkdir(parents=True,exist_ok=True)
THRESHOLD=.99
def read_tsv(name):
 return list(csv.DictReader((BASE/name).open(encoding='utf-8-sig'),delimiter='\t'))
def normalize(s):
 return ''.join(c for c in unicodedata.normalize('NFD',s.lower().replace('æ','ae').replace('œ','oe')) if not unicodedata.combining(c))
FR={'a':'a','i':'i','y':'y','u':'u','o':'o','O':'O','e':'e','E':'E','°':'@','2':'Y','9':'W','5':'E~','1':'W~','@':'A~','§':'O~','S':'S','Z':'Z','N':'n^','G':'N','R':'r/','8':'y','x':'x'}
IT={'E':'E','O':'O','c':'tS','g':'dZ','z':'ts','Z':'dz','G':'g','L':'l^','S':'S','N':'n^','r':'r/'}
for ch in 'bpdtkgfvszmnljw':FR.setdefault(ch,ch)
for ch in 'aeioubpdtkfvsmnljw':IT.setdefault(ch,ch)
DE={'2:':'Y:','9':'W','Y':'y','6':'3','R':'Q"','a:':'A:','a^':'A~','E^':'E~','o^':'O~'}
for ch in ['?','@','C','E','E:','I','N','O','S','U','Z','a','aI','aU','OY','b','d','e:','f','g','h','i:','j','k','l','m','n','o:','p','s','t','u:','v','x','y:','z']:DE.setdefault(ch,ch)
EN={'AA':'A:','AE':'a','AH':'V','AO':'O:','AW':'aU','AY':'aI','B':'b','CH':'tS','D':'d','DH':'D','EH':'E','ER':'3:','EY':'eI','F':'f','G':'g','HH':'h','IH':'I','IY':'i:','JH':'dZ','K':'k','L':'l','M':'m','N':'n','NG':'N','OW':'oU','OY':'OI','P':'p','R':'r','S':'s','SH':'S','T':'t2','TH':'T','UH':'U','UW':'u:','V':'v','W':'w','Y':'j','Z':'z','ZH':'Z'}
VOWEL_CODES={'a','e','i','o','u','E','O','@','Y','W','y','A~','E~','O~','W~','I','U','V','A:','O:','i:','u:','3:','3','Y:','y:','e:','E:','o:','aI','aU','OY','eI','OI','oU'}
def stress(tokens,level="'"):
 result=[];placed=False
 for t in tokens:
  if not placed and t in VOWEL_CODES:result.append(level);placed=True
  result.append(t)
 return ''.join(result)
def mapped_chars(s,mapping):
 return [mapping[ch] for ch in s]
def latin(sylls):
 chunks=[re.sub('[^a-z]','',normalize(s)) for s in sylls];word=''.join(chunks);owners=[]
 for i,s in enumerate(chunks):owners.extend([i]*len(s))
 result=[[] for _ in chunks]
 def emit(i,n,tokens,last=False):
  owner=owners[i+n-1] if last else owners[i]
  result[owner].extend(tokens)
 def front(i):return re.match('(e|i|y|ae|oe)',word[i:]) is not None
 def vow(c):return c in 'aeiouy'
 i=0
 while i<len(word):
  c=word[i];pair=word[i:i+2];n=1;tokens=[c];last=False
  if pair in ['ae','oe'] and owners[i]==owners[i+1] and not re.search('[ëË]',sylls[owners[i]]):n=2;tokens=['e']
  elif pair in ['ch','ph','th','rh']:n=2;tokens=[{'ch':'k','ph':'f','th':'t','rh':'r/'}[pair]]
  elif pair=='gn':n=2;tokens=['n^'];last=True
  elif pair=='sc' and front(i+2):n=2;tokens=['S'];last=True
  elif pair=='xc' and front(i+2):
   result[owners[i]].append('k');result[owners[i+1]].append('S');i+=2;continue
  elif pair=='cc' and front(i+2):
   result[owners[i]].append('t');result[owners[i+1]].append('tS');i+=2;continue
  elif pair=='qu':n=2;tokens=['k','w']
  elif c=='c':tokens=['tS' if front(i+1) else 'k']
  elif c=='g':tokens=['dZ' if front(i+1) else 'g']
  elif c=='t' and word[i+1:i+2]=='i' and word[i+2:i+3] in ['a','e','i','o','u','y'] and i>0 and word[i-1] not in 'stx':tokens=['ts']
  elif c=='h':tokens=['k'] if word in ['mihi','nihil','nihilo','nihilum'] or 'annihil' in word else []
  elif c=='x':tokens=['k','s']
  elif c=='y':tokens=['i']
  elif c=='r':tokens=['r/']
  elif c=='z':tokens=['dz']
  elif c=='i' and i+1<len(word) and vow(word[i+1]) and owners[i]==owners[i+1]:tokens=['j']
  elif c=='n' and word[i:i+3]=='ngu' and i+3<len(word) and vow(word[i+3]) and owners[i+2]==owners[i+3]:
   result[owners[i]].append('N');result[owners[i+1]].append('g');result[owners[i+2]].append('w');i+=3;continue
  emit(i,n,tokens,last);i+=n
 return result
def gabc_words(text):
 if '%%' not in text:return []
 body=text.split('%%',1)[1]
 body=re.sub(r'<(i|v|alt)>.*?</\1>',' ',body,flags=re.S)
 body=re.sub(r'<[^>]*>','',body);body=re.sub(r'\[[^\]]*\]','',body);body=re.sub(r'%[^\n]*','',body)
 words=[];current=[]
 for prefix in re.findall(r'([^()]*)\([^()]*\)',body):
  matches=list(re.finditer(r'[^\W\d_]+',prefix,re.UNICODE))
  for match in matches:
   before=prefix[:match.start()]
   if current and re.search(r'[\s,;:.!?]',before):words.append(current);current=[]
   token=match.group()
   if re.fullmatch('[a-z]+',normalize(token)):current.append(token)
  if current and matches and re.search(r'[\s,;:.!?]',prefix[matches[-1].end():]):words.append(current);current=[]
 if current:words.append(current)
 return words
def selected(counter):
 ordered=counter.most_common();total=sum(counter.values());cum=0;chosen=[]
 for key,w in ordered:
  chosen.append(key);cum+=w
  if cum>=total*THRESHOLD:break
 return chosen,{'sourceDistinct':len(counter),'sourceTokens':total,'selectedSourceSyllables':len(chosen),'coveredSourceTokens':cum,'coverage':cum/total}
PROFILES=[]
def output_profile(lang,title,voice,counter,mapper,examples,source,extra=None):
 keys,stats=selected(counter);entries={};unknown=[]
 for rank,key in enumerate(keys,1):
  try:code,tokens,notes=mapper(key)
  except KeyError as e:unknown.append([key,str(e)]);continue
  if not code:unknown.append([key,'empty phoneme sequence']);continue
  identity=voice+'|'+code+'|145|espeakng-loader-0.2.4'
  uid=hashlib.sha256(identity.encode()).hexdigest()[:20]
  e=entries.setdefault(uid,{'id':uid,'mnemonic':code,'tokens':tokens,'rank':rank,'sourceForms':[],'examples':[],'sourceWeight':0,'notes':notes})
  e['sourceForms'].append(key);e['sourceWeight']+=counter[key]
  e['examples']=list(dict.fromkeys(e['examples']+examples.get(key,[])))[:3]
  e['notes']=list(dict.fromkeys(e['notes']+notes))
 if unknown:raise ValueError((lang,'unmapped selected syllables',unknown[:30]))
 if extra:
  for key,tokens,ex in extra:
   code=stress(tokens);identity=voice+'|'+code+'|145|espeakng-loader-0.2.4';uid=hashlib.sha256(identity.encode()).hexdigest()[:20]
   e=entries.setdefault(uid,{'id':uid,'mnemonic':code,'tokens':tokens,'rank':None,'sourceForms':[],'examples':[],'sourceWeight':0,'notes':['mandatory liturgical supplement']})
   if key not in e['sourceForms']:e['sourceForms'].append(key)
   e.setdefault('liturgicalWords',[])
   if ex not in e['liturgicalWords']:e['liturgicalWords'].append(ex)
   e['examples']=list(dict.fromkeys([ex]+e['examples']))[:3]
 p={'language':lang,'title':title,'voice':voice,'rateWpm':145,'source':source,'selection':stats,'entries':list(entries.values())}
 p['selection']['audioCandidates']=len(entries)
 (OUT/(lang+'.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf8');PROFILES.append({k:v for k,v in p.items() if k!='entries'})
 print('SELECTED',lang,json.dumps(stats,ensure_ascii=False),flush=True)
# French
counter=collections.Counter();examples=collections.defaultdict(list)
for r in read_tsv('fr.tsv'):
 w=float(r['freqfilms2'])
 if w<=0:continue
 for syll in r['syll'].split('-'):
  counter[syll]+=w
  if len(examples[syll])<3 and r['ortho'] not in examples[syll]:examples[syll].append(r['ortho'])
def fr_map(s):
 tokens=mapped_chars(s,FR);notes=[]
 if '8' in s:notes.append('French /ɥ/ approximated by the native eSpeak /y/ glide')
 if '1' in s:notes.append('French nasal /œ̃/ may merge with /ɛ̃/ in this engine')
 return stress(tokens),tokens,notes
output_profile('fr','Français','fr',counter,fr_map,examples,'Lexique 3.83, freqfilms2; grammatical entries summed')
# Italian
counter=collections.Counter();examples=collections.defaultdict(list)
rows=list(csv.reader((BASE/'it-syllables.tsv').open(encoding='utf-8-sig'),delimiter='\t'))
for r in rows[2:]:
 if r and float(r[3])>0:counter[r[0]]+=float(r[3])
for r in read_tsv('it-wordforms.tsv'):
 for syll in r['PhoneSyll'].split('.'):
  if syll in counter and len(examples[syll])<3 and r['word'] not in examples[syll]:examples[syll].append(r['word'])
def it_map(s):
 tokens=mapped_chars(s,IT);return stress(tokens),tokens,[]
output_profile('it','Italien','it',counter,it_map,examples,'PhonItalia 1.10, syllable Total TokenF')
# German
counter=collections.Counter()
rows=list(csv.reader((BASE/'de.tsv').open(encoding='utf-8-sig'),delimiter='\t'))
for r in rows[1:]:
 if float(r[-1])>0:counter[r[1]]+=float(r[-1])
def de_map(s):
 ss=[t for t in s.split('_') if t];tokens=[DE[t] for t in ss];notes=[]
 if any('^' in t for t in ss):notes.append('Assumed nasal French loan vowel: original caret convention not independently confirmed')
 return stress(tokens),tokens,notes
output_profile('de','Allemand','de',counter,de_map,{},'German Syllable Frequencies, mean token frequencies across six corpora')
# American English; accents distinguished
zf=zipfile.ZipFile(BASE/'en-frequency.zip');zp=zipfile.ZipFile(BASE/'en-pronunciation.zip')
rows=csv.DictReader(io.StringIO(zf.read('Brysbaert-BRM-2009/SUBTLEXus74286wordstextversion.txt').decode('cp1252')),delimiter='\t')
freq=collections.Counter()
for r in rows:freq[r['Word'].lower()]+=int(r['FREQcount'])
prons=collections.defaultdict(set)
for line in zp.read('cmudict.syllabified.txt').decode('cp1252').splitlines():
 if not line.strip() or line.startswith(('##',';;;')):continue
 bits=line.split();word=re.sub(r'\(\d+\)$','',bits[0].lower());prons[word].add(tuple(bits[1:]))
counter=collections.Counter();examples=collections.defaultdict(list);matched=0
for word,count in freq.items():
 if word not in prons:continue
 matched+=count;weight=count/len(prons[word])
 for pron in prons[word]:
  parts=[[]]
  for token in pron:
   if token=='-':parts.append([])
   else:parts[-1].append(token)
  for part in parts:
   if not part:continue
   s=' '.join(part);counter[s]+=weight
   if len(examples[s])<3 and word not in examples[s]:examples[s].append(word)
def en_map(s):
 tokens=[];codes=[]
 for token in s.split():
  match=re.fullmatch(r'([A-Z]+)([012]?)',token);phone,accent=match.groups();code=EN[phone]
  if phone=='AH' and accent=='0':code='@'
  if phone=='ER' and accent=='0':code='3'
  tokens.append(code)
  if accent:codes.append({'0':'%','1':"'",'2':','}[accent])
  codes.append(code)
 return ''.join(codes),tokens,[]
output_profile('en-US','Anglais américain','en-us',counter,en_map,examples,'SUBTLEXus 74,286 word forms + syllabified CMU 0.6; variants equally weighted')
PROFILES[-1]['matchedWordTokenCoverage']=matched/sum(freq.values())
# Ecclesiastical Italian Latin and mandatory liturgical Greek
z=zipfile.ZipFile(BASE/'chant.zip');counter=collections.Counter();examples=collections.defaultdict(list);seen=set();used=0;rejected=0
for name in sorted(n for n in z.namelist() if n.endswith('.gabc')):
 words=gabc_words(z.read(name).decode('utf8',errors='replace'));key=tuple(tuple(normalize(s) for s in w) for w in words)
 if not key or key in seen:continue
 seen.add(key);used+=1
 for word in words:
  tokens=latin(word);orth=''.join(word)
  for original,ts in zip(word,tokens):
   if not ts:rejected+=1;continue
   code=stress(ts);counter[code]+=1
   if len(examples[code])<3 and orth not in examples[code]:examples[code].append(orth)
# Include every syllable from the required Greek formulas, and useful Latin formulas, independently of frequency.
mandatory=[['Ky','ri','e'],['Chris','te'],['e','le','i','son'],['Ha','gi','os'],['A','gi','os'],['o'],['The','os'],['is','chy','ros'],['a','tha','na','tos'],['hi','mas'],['i','mas'],['a','men'],['al','le','lu','ia'],['ho','san','na'],['mi','hi'],['ni','hil']]
extra=[];word_index=[]
for word in mandatory:
 ts=latin(word);word_index.append({'text':''.join(word),'syllables':[{'text':s,'mnemonic':stress(t)} for s,t in zip(word,ts)]})
 for s,t in zip(word,ts):
  if t:extra.append((normalize(s),t,''.join(word)))
def la_map(s):
 # Native code already retains contextual letter conversion and the true musical boundaries.
 return s,re.findall(r"r/|n\^|l\^|tS|dZ|ts|dz|[aeioubpdtkgfvszmnlrjwNS]|.",s.replace("'",'')),[]
output_profile('la','Latin italien et grec liturgique','it',counter,la_map,examples,'GregoBaseCorpus 0.4, deduplicated musical word/segment sequences; Roman Latin context rules',extra)
PROFILES[-1]['uniqueChantTextSequences']=used;PROFILES[-1]['silentSegments']=rejected
(OUT/'liturgical-words.json').write_text(json.dumps(word_index,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'summary.json').write_text(json.dumps({'version':'1.0.0','threshold':THRESHOLD,'profiles':PROFILES,'sourceFiles':json.loads((BASE/'sources.json').read_text())},ensure_ascii=False,indent=2),encoding='utf8')
print('SELECTION_READY',sum(p['selection']['audioCandidates'] for p in PROFILES),flush=True)


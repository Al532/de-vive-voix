import sys,urllib.request,json,hashlib,concurrent.futures,time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
BASE=Path(__file__).resolve().parent
OUT=BASE/'corpora';OUT.mkdir(exist_ok=True)
URLS={
 'fr.tsv':'https://www.lexique.org/databases/Lexique383/Lexique383.tsv',
 'it-syllables.tsv':'https://raw.githubusercontent.com/stefanocoretta/phonItaliaR/main/data-raw/phonItalia-1.10/phonItalia-1.10-syllables.tsv',
 'it-wordforms.tsv':'https://raw.githubusercontent.com/stefanocoretta/phonItaliaR/main/data-raw/phonItalia-1.10/phonItalia-1.10-wordforms.tsv',
 'de.tsv':'https://raw.githubusercontent.com/petrawagner/german-syllable-frequencies/main/syllableFrequencyTables/syllable_frequency_table.txt',
 'en-frequency.zip':'https://blairarmstrong.net/tools/Union_Subtl_CMUPron/SUBTL_BRM-2009_original.zip',
 'en-pronunciation.zip':'https://blairarmstrong.net/tools/Union_Subtl_CMUPron/CMU_PronDict_v0.6Syllabified.zip',
 'chant.zip':'https://github.com/bacor/gregobasecorpus/releases/download/v0.4/gregobasecorpus-v0.4.zip'}
def download(pair):
 name,url=pair;p=OUT/name
 if not p.exists():
  for attempt in range(3):
   try:
    req=urllib.request.Request(url,headers={'User-Agent':'De-vive-voix-catalogue/1.0 (linguistic research)'})
    data=urllib.request.urlopen(req,timeout=90).read()
    p.write_bytes(data);break
   except Exception:
    if attempt==2:raise
    time.sleep(2)
 data=p.read_bytes()
 result={'name':name,'url':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 print(json.dumps(result),flush=True)
 return result
results=[]
with concurrent.futures.ThreadPoolExecutor(5) as ex:
 for r in ex.map(download,URLS.items()):results.append(r)
(OUT/'sources.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print('CORPORA_READY',len(results),flush=True)


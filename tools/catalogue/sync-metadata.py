from pathlib import Path
import argparse,json
P=argparse.ArgumentParser();P.add_argument('--selection',type=Path,required=True);P.add_argument('--output',type=Path,required=True);A=P.parse_args()
for selection in A.selection.glob('*.json'):
 if selection.stem in ['summary','liturgical-words']:continue
 source=json.loads(selection.read_text(encoding='utf8'));dest=A.output/'v1'/source['language']/'index.json';index=json.loads(dest.read_text(encoding='utf8'));entries={e['id']:e for e in source['entries']}
 for e in index['entries']:
  s=entries[e['id']]
  for field in ['examples','sourceForms','notes','liturgicalWords']:
   if field in s:e[field]=s[field]
 dest.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('METADATA_SYNCED')


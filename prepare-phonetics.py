"""Extract original lyric boundaries and note references without altering score.json."""
import json, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
base=Path(__file__).parent
with zipfile.ZipFile(base/'dist/Belissen.mxl') as z:
    container=ET.fromstring(z.read('META-INF/container.xml'))
    rootfile=next(x for x in container.iter() if x.tag.endswith('rootfile')).get('full-path')
    root=ET.fromstring(z.read(rootfile))
names={x.get('id'):x.findtext('part-name') for x in root.findall('part-list/score-part')}
parts=[]
for part in root.findall('part'):
    words=[]; pending=[]; issues=[]; previous=None
    def flush():
        if pending:
            words.append({'text':''.join(s['text'] for s in pending),'syllables':pending[:],'issues':issues[:]})
            pending.clear(); issues.clear()
    for m in part.findall('measure'):
        for ni,note in enumerate(m.findall('note')):
            ref={'measure':m.get('number'),'note':ni+1,'grace':note.find('grace') is not None}
            if note.find('rest') is not None:
                previous=None
                continue
            lyric=note.find('lyric')
            if lyric is None or lyric.find('text') is None:
                if previous is not None: previous['notes'].append(ref)
                continue
            kind=lyric.findtext('syllabic','single')
            if kind in ('begin','single') and pending:
                issues.append('Mot précédent interrompu dans le MusicXML.'); flush()
            if kind in ('middle','end') and not pending:
                issues.append('Début du mot manquant dans le MusicXML.')
            previous={'text':''.join(lyric.itertext()).strip() if len(lyric.findall('text'))>1 else lyric.findtext('text',''), 'kind':kind,'notes':[ref]}
            if lyric.find('elision') is not None:
                previous['text']='‿'.join(x.text or '' for x in lyric.findall('text'))
                issues.append('Élision : plusieurs syllabes partagent une note ; vérifier manuellement.')
            pending.append(previous)
            if kind in ('end','single'): flush()
    if pending:
        issues.append('Fin du mot manquante dans le MusicXML.'); flush()
    if words: parts.append({'name':names[part.get('id')],'words':words})
(base/'dist/phonetics-score.json').write_text(json.dumps({'title':'Gloria Patri et Filio','parts':parts},ensure_ascii=False,separators=(',',':')))
print(len(parts),'parties vocales,',sum(len(p['words']) for p in parts),'occurrences de mots,',sum(bool(w['issues']) for p in parts for w in p['words']),'anomalies de structure')

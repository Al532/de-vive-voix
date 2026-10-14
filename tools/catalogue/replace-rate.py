"""Replace the catalogue from its existing phonetic selection, without corpus downloads."""
import argparse, hashlib, importlib.util, json, shutil, subprocess, sys, tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
master = json.loads((source / 'index.json').read_text(encoding='utf8'))
scripts = Path(__file__).resolve().parent
if master['engine']['rateWpm'] == 175:
    print('Catalogue already recorded at 175 WPM.')
    if source != output:
        shutil.copytree(source, output, dirs_exist_ok=True)
    sys.exit(0)

spec = importlib.util.find_spec('espeakng_loader')
if not spec:
    raise RuntimeError('Install espeakng-loader==0.2.4 and numpy first.')
runtime = Path(spec.origin).parent.parent
before = sum(p.stat().st_size for p in source.rglob('*.wav'))
with tempfile.TemporaryDirectory(prefix='catalogue-175-') as temp:
    selection = Path(temp) / 'selection'
    generated = Path(temp) / 'audio'
    selection.mkdir()
    profiles = []
    for profile in master['languages']:
        index = json.loads((source / profile['indexUrl']).read_text(encoding='utf8'))
        index['rateWpm'] = 175
        for entry in index['entries']:
            if index['language'] in ('la', 'it'):
                entry['mnemonic'] = entry['mnemonic'].replace('r/', 'R')
                entry['tokens'] = ['R' if token == 'r/' else token for token in entry['tokens']]
            identity = index['voice'] + '|' + entry['mnemonic'] + '|175|espeakng-loader-0.2.4'
            entry['id'] = hashlib.sha256(identity.encode()).hexdigest()[:20]
            for key in ('url', 'duration', 'bytes', 'sha256', 'peak', 'rms', 'engineIPA'):
                entry.pop(key, None)
        (selection / (index['language'] + '.json')).write_text(json.dumps(index, ensure_ascii=False), encoding='utf8')
        profiles.append({key: value for key, value in index.items() if key != 'entries'})
    summary = {'profiles': profiles, 'sourceFiles': master['sourceFiles']}
    (selection / 'summary.json').write_text(json.dumps(summary), encoding='utf8')
    words = json.loads((source / master['liturgicalWordsUrl']).read_text(encoding='utf8'))
    for word in words:
        for syllable in word['syllables']:
            syllable['mnemonic'] = syllable['mnemonic'].replace('r/', 'R')
    (selection / 'liturgical-words.json').write_text(json.dumps(words, ensure_ascii=False), encoding='utf8')
    subprocess.run([sys.executable, str(scripts / 'generate.py'), '--runtime', str(runtime), '--selection', str(selection), '--output', str(generated)], check=True)
    subprocess.run([sys.executable, str(scripts / 'verify.py'), str(generated)], check=True)
    # Only replace files after the entire new catalogue has passed verification.
    output.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(output / 'v1', ignore_errors=True)
    shutil.copytree(generated / 'v1', output / 'v1')
    for name in ('index.json', 'verification.json'):
        shutil.copy2(generated / name, output / name)
after = sum(p.stat().st_size for p in output.rglob('*.wav'))
print(json.dumps({'beforeBytes': before, 'afterBytes': after, 'savedBytes': before - after, 'rateWpm': 175}))

"""Rebuild legacy listening sequences from the sole 175 WPM sources and remove unused speeds."""
import json, wave
from pathlib import Path

root = Path(__file__).resolve().parents[2] / 'dist'
pilot = json.loads((root / 'bloc-speech-audio.json').read_text(encoding='utf8'))
manifest = json.loads((root / 'phonetics-audio.json').read_text(encoding='utf8'))
before = sum(p.stat().st_size for p in root.rglob('*.wav'))
for ipa in manifest['syllables']:
    asset = pilot[ipa][0]
    assert len(pilot[ipa]) == 1 and asset['rateWpm'] == 175
    manifest['syllables'][ipa] = {**asset, 'mnemonic': asset['code'], 'engineIPA': ipa}
kept = set()
for key, sequence in manifest['sequences'].items():
    pcm, cues = bytearray(), []
    for index, ipa in enumerate(key.split('|')):
        with wave.open(str(root / manifest['syllables'][ipa]['url']), 'rb') as wav:
            assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 22050)
            samples = wav.readframes(wav.getnframes())
        start = len(pcm) / 2 / 22050
        pcm.extend(samples)
        cues.append({'index': index, 'start': start, 'end': len(pcm) / 2 / 22050})
        if index < len(key.split('|')) - 1:
            pcm.extend(b'\0\0' * int(22050 * .18))
    path = root / sequence['url']
    if not path.stem.endswith('-175'):
        path = path.with_name(path.stem + '-175.wav')
    path.parent.mkdir(parents=True, exist_ok=True)
    sequence['url'] = path.relative_to(root).as_posix()
    with wave.open(str(path), 'wb') as wav:
        wav.setparams((1, 2, 22050, 0, 'NONE', 'not compressed'))
        wav.writeframes(pcm)
    sequence.update(cues=cues, duration=len(pcm) / 2 / 22050, rateWpm=175)
    kept.add(path.resolve())
manifest['rateWpm'] = 175
(root / 'phonetics-audio.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
removed = 0
for path in (root / 'phonetics-audio').glob('*.wav'):
    if path.resolve() not in kept:
        path.unlink()
        removed += 1
bundle = json.loads((root / 'scores/exaudi-nos/bundle.json').read_text(encoding='utf8'))
used = {asset['url'] for verse in bundle['verses'].values() for assets in verse['assets'].values() for asset in assets}
for path in (root / 'scores/exaudi-nos/audio').glob('*.wav'):
    if path.relative_to(root).as_posix() not in used:
        path.unlink()
        removed += 1
after = sum(p.stat().st_size for p in root.rglob('*.wav'))
print(json.dumps({'removedVariants': removed, 'savedBytes': before - after, 'legacySequences': len(kept)}))

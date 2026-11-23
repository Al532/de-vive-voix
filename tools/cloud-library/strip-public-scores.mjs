import { readFile, rm } from 'node:fs/promises';
import vm from 'node:vm';

const config = {};
vm.runInNewContext(await readFile('dist/cloud-config.js', 'utf8'), config);
if (config.DVV_CLOUD_CONFIG?.cutover === true) {
  const { url, publicKey } = config.DVV_CLOUD_CONFIG;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) || !/^(sb_publishable_|eyJ)/.test(publicKey)) {
    throw new Error('Paramètres publics de la bibliothèque absents. Les partitions restent dans dist.');
  }
  for (const path of [
    'scores', 'score.json', 'Belissen.mxl', 'bloc-speech-audio.json',
    'phonetics-score.json', 'phonetique.html', 'tempo-bench.html',
    'belissen-pitch.json', 'belissen-pitch.js', 'belissen-pitch'
  ]) await rm('dist/' + path, { recursive: true, force: true });
}

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const dist = resolve('dist');
const project = new URL(process.env.DVV_SUPABASE_URL || 'https://invalid.invalid');
const secret = process.env.DVV_SUPABASE_SERVICE_KEY;
if (!secret || project.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname)) {
  throw new Error('Configurer DVV_SUPABASE_URL et DVV_SUPABASE_SERVICE_KEY dans l’environnement local.');
}

const headers = { apikey: secret };
if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;
const bucket = '/storage/v1/object';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function local(relative) {
  const file = resolve(dist, relative);
  if (!file.startsWith(dist + sep)) throw new Error('Chemin hors de dist : ' + relative);
  return file;
}

async function json(file) {
  return JSON.parse(await readFile(local(file), 'utf8'));
}

async function request(path, options = {}) {
  return fetch(new URL(path, project), { ...options, headers: { ...headers, ...options.headers } });
}

async function upload(kind, bytes, type) {
  const checksum = digest(bytes), path = `dvv-library/catalogue/${kind}/${checksum}`;
  const uploaded = await request(`${bucket}/${path}`, { method: 'POST', body: bytes, headers: { 'Content-Type': type, 'x-upsert': 'false' } });
  const copy = await request(`${bucket}/authenticated/${path}`);
  if (!copy.ok || digest(Buffer.from(await copy.arrayBuffer())) !== checksum) {
    throw new Error(`Copie du catalogue non vérifiée (${kind}, ${uploaded.status}/${copy.status}).`);
  }
  return checksum;
}

async function checkAudio(assets) {
  for (const url of new Set(Object.values(assets).flat().map(asset => asset.url))) {
    if (!/^(catalogue-audio|speech-audio-175|tempo-bench-audio)\//.test(url) || !(await stat(local(url))).isFile()) {
      throw new Error('Un son du catalogue est indisponible : ' + url);
    }
  }
}

async function prepare() {
  const catalogue = await json('scores/index.json');
  const pilot = { id: 'belissen-pilote', filename: 'Belissen.mxl', pilot: true, score: await json('score.json'), assets: await json('bloc-speech-audio.json') };
  const items = [{ record: pilot, sourceUrl: 'Belissen.mxl' }];
  for (const entry of catalogue.scores) items.push({ record: await json(entry.bundleUrl), sourceUrl: entry.sourceUrl });
  const rows = [];
  for (const { record, sourceUrl } of items) {
    for (const assets of record.pilot ? [record.assets] : Object.values(record.verses).map(verse => verse.assets)) await checkAudio(assets);
    const source = await readFile(local(sourceUrl));
    if (record.sourceSha256 && record.sourceSha256 !== digest(source)) throw new Error('Le MusicXML ne correspond pas à ' + record.score.title);
    const sourceChecksum = await upload('sources', source, 'application/octet-stream');
    delete record.sourceUrl;
    const checksum = await upload('bundles', Buffer.from(JSON.stringify({ ...record, sourceChecksum })), 'application/json');
    rows.push({ id: record.id, title: record.score.title, composer: record.score.composer || '', checksum });
  }
  return rows;
}

const rows = await prepare();
const response = await request('/rest/v1/dvv_catalogue?on_conflict=id', {
  method: 'POST', body: JSON.stringify(rows), headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }
});
if (!response.ok) throw new Error('Index du catalogue indisponible (' + response.status + ').');
const recorded = await response.json();
if (rows.some(expected => !recorded.some(row => row.id === expected.id && row.checksum === expected.checksum))) {
  throw new Error('Index du catalogue incomplet.');
}
console.log('Catalogue vérifié : ' + rows.map(row => row.title).join(', '));

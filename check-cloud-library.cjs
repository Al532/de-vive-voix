const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function build() {
  let user = 'first';
  const members = new Set(['first', 'second']);
  const rows = new Map(), catalogue = new Map(), objects = new Map();
  function table(name) {
    const data = name === 'dvv_catalogue' ? catalogue : rows;
    return {
      select: () => ({ eq: (_column, id) => ({ maybeSingle: async () => ({
        data: members.has(user) ? name === 'dvv_members' ? { user_id: user } : data.get(id) || null : null
      }) }) }),
      insert: async row => {
        if (data.has(row.id)) return { error: { code: '23505' } };
        data.set(row.id, row);
        return {};
      }
    };
  }
  const storage = {
    async upload(path, body) {
      if (objects.has(path)) return { error: { status: 409 } };
      objects.set(path, body);
      return { data: {} };
    },
    async download(path) {
      if (!members.has(user) || !/^(shared|catalogue)\//.test(path)) return { error: { status: 403 } };
      return objects.has(path) ? { data: objects.get(path) } : { error: { status: 404 } };
    }
  };
  const wav = new Blob(['une syllabe']);
  const sandbox = {
    crypto, Blob, DVV_CLOUD_CONFIG: { url: 'https://example.supabase.co', publicKey: 'test', cutover: true },
    PracticeLibrary: { getAudio: async key => key === 'syllabe' ? { blob: wav } : null },
    supabase: { createClient: () => ({
      from: table,
      storage: { from: () => storage },
      auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }) }
    }) }
  };
  vm.runInNewContext(fs.readFileSync('dist/cloud-library.js', 'utf8'), sandbox);
  return { api: sandbox.CloudLibrary, objects, rows, setUser: next => { user = next; } };
}

async function verify() {
  const { api, objects, rows, setUser } = build();
  const record = {
    id: 'partition', filename: 'partition.musicxml', originalFile: new Blob(['<score-partwise/>']),
    score: { title: 'Partition' }, verses: { 1: { assets: { local: [{ cacheId: 'syllabe' }], catalogue: [{ url: 'catalogue-audio/son.wav' }] } } }
  };
  await assert.rejects(api.transfer(record), /uniquement sur cet appareil/);
  await api.transfer(record, { upload: true });
  assert.equal(objects.size, 3, 'un original, un fichier préparé et une syllabe hors catalogue');
  await api.transfer({ ...record, created: 123, stats: { cached: 1 } }, { upload: true });
  assert.equal(objects.size, 3, 'une reprise ne duplique pas les fichiers');
  await api.transfer(record);
  const cloud = await api.getRecord(record.id);
  assert.equal(await (await cloud.readAudio(cloud.record.cloudAudio.syllabe)).text(), 'une syllabe');
  assert.equal(cloud.record.verses[1].assets.catalogue[0].url, 'catalogue-audio/son.wav');

  await assert.rejects(api.transfer({ ...record, score: { title: 'Version différente' } }, { upload: true }), /autre version/);
  const audioPath = [...objects.keys()].find(path => path.includes('/audio/'));
  const audio = objects.get(audioPath);
  objects.set(audioPath, new Blob(['corrompu']));
  await assert.rejects(api.transfer(record), /ne correspond pas/);
  objects.delete(audioPath);
  await assert.rejects(api.transfer(record), /indisponible/);
  objects.set(audioPath, audio);

  setUser('second');
  assert.equal((await api.getRecord(record.id)).record.score.title, 'Partition');
  await api.transfer(record);
  setUser('visitor');
  await assert.rejects(api.getRecord(record.id), /n’a pas accès/);
  await assert.rejects(api.transfer(record, { upload: true }), /n’a pas accès/);
  setUser(null);
  await assert.rejects(api.transfer(record, { upload: true }), /Connecte-toi/);
  assert.equal(rows.size, 1);
  console.log('Bibliothèque partagée : accès aux deux membres, compte tiers refusé, vérification avant purge et reprise sans doublon.');
}

verify().catch(error => { console.error(error); process.exitCode = 1; });

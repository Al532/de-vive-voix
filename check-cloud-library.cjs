const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function build() {
  let user = 'first';
  const rows = new Map(), catalogue = new Map(), objects = new Map();
  function table(name) {
    const data = name === 'dvv_catalogue' ? catalogue : rows;
    const rowKey = id => name === 'dvv_catalogue' ? id : user + '/' + id;
    return {
      select: () => ({ eq: (_column, id) => ({ maybeSingle: async () => ({ data: data.get(rowKey(id)) || null }) }) }),
      insert: async row => {
        const key = rowKey(row.id);
        if (data.has(key)) return { error: { code: '23505' } };
        data.set(key, row);
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
      if (!path.startsWith(user + '/') && !path.startsWith('catalogue/')) return { error: { status: 403 } };
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
  assert.equal(await api.getRecord(record.id), null);
  await assert.rejects(api.transfer(record), /uniquement sur cet appareil/);
  setUser(null);
  await assert.rejects(api.transfer(record, { upload: true }), /Connecte-toi/);
  assert.equal(rows.size, 1);
  console.log('Bibliothèque en ligne : reprise sans doublon, relecture des fichiers et refus de purge sur copie absente ou corrompue.');
}

verify().catch(error => { console.error(error); process.exitCode = 1; });

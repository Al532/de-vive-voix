const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

function build() {
  let user = 'first';
  const members = new Set(['first', 'second']);
  const rows = new Map(), catalogue = new Map(), objects = new Map(), cached = new Map();
  let downloads = 0;
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
      },
      update: values => ({ eq: (_column, id) => ({ select: () => ({ single: async () => {
        if (!members.has(user) || !data.has(id)) return { error: new Error('Denied') };
        Object.assign(data.get(id), values);
        return { data: { id } };
      } }) }) })
    };
  }
  const storage = {
    async upload(path, body) {
      if (objects.has(path)) return { error: { status: 409 } };
      objects.set(path, body);
      return { data: {} };
    },
    async download(path) {
      downloads++;
      if (!members.has(user) || !/^(shared|catalogue)\//.test(path)) return { error: { status: 403 } };
      return objects.has(path) ? { data: objects.get(path) } : { error: { status: 404 } };
    }
  };
  const wav = new Blob(['une syllabe']);
  const sandbox = {
    crypto, Blob, Response, URL, location: { href: 'https://example.test/de-vive-voix/' },
    DVV_CLOUD_CONFIG: { url: 'https://example.supabase.co', publicKey: 'test', cutover: true },
    caches: {
      open: async () => ({ match: async url => cached.get(url)?.clone(), put: async (url, response) => cached.set(url, response), delete: async url => cached.delete(url) }),
      delete: async () => cached.clear()
    },
    PracticeLibrary: { getAudio: async key => key === 'syllabe' ? { blob: wav } : null },
    supabase: { createClient: () => ({
      from: table,
      storage: { from: () => storage },
      auth: {
        getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }),
        signInWithPassword: async ({ email, password }) => {
          if (password !== 'test-password') return { error: new Error('Invalid password') };
          user = email;
          return { data: { user: { id: user } } };
        },
        signOut: async () => { user = null; return {}; }
      }
    }) }
  };
  vm.runInNewContext(fs.readFileSync('dist/cloud-library.js', 'utf8'), sandbox);
  return { api: sandbox.CloudLibrary, objects, rows, cached, downloads: () => downloads, setUser: next => { user = next; } };
}

async function verify() {
  const { api, objects, rows, cached, downloads, setUser } = build();
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
  const warm = downloads();
  const reopened = await api.getRecord(record.id);
  await reopened.readAudio(reopened.record.cloudAudio.syllabe);
  assert.equal(downloads(), warm, 'un morceau et ses sons relus utilisent le cache local');

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
  await assert.rejects(api.signIn('first', 'incorrect'), /Connexion impossible/);
  await api.signIn('first', 'test-password');
  assert.equal((await api.session()).user.id, 'first');
  await api.signIn('second', 'test-password');
  assert.equal((await api.getRecord(record.id)).record.id, 'partition');
  await api.removeScore(record);
  assert.equal(await api.getRecord(record.id), null);
  await assert.rejects(api.transfer(record, { upload: true }), /retirée/);
  await api.transfer(record, { upload: true, restore: true });
  assert.equal((await api.getRecord(record.id)).record.id, 'partition');
  await assert.rejects(api.signIn('visitor', 'test-password'), /n’a pas accès/);
  assert.equal(await api.session(), null);
  await api.signIn('first', 'test-password');
  await api.signOut();
  assert.equal(cached.size, 0);
  assert.equal(rows.size, 1);
  console.log('Bibliothèque partagée : accès aux deux membres, compte tiers refusé, vérification avant purge et reprise sans doublon.');
}

async function verifyMarieMigration() {
  const history = [], flags = new Map();
  const folder = { id: '5a4094c9-757f-4299-8673-52f4c6545e01', name: 'Noël' };
  const record = id => ({ id, score: { title: id } });
  const setting = { records: [record('correct'), record('incomplet')], folders: [folder], account: { user: { id: 'migration-test-member' } } };
  const sandbox = {
    crypto, TextEncoder,
    localStorage: { getItem: key => flags.get(key), setItem: (key, value) => flags.set(key, value) },
    CloudLibrary: {
      transfer: async ({ id }) => {
        history.push('verify:' + id);
        if (id === 'incomplet') throw Error('Son manquant.');
      },
      move: async (id, folderId) => { assert.equal(folderId, folder.id); history.push('folder:' + id); }
    },
    PracticeLibrary: { remove: async (id, expected) => { assert.equal(id, expected.id); history.push('purge:' + id); return true; } }
  };
  const source = fs.readFileSync('dist/migration-marie.js', 'utf8').replace(/const accountHash = '[a-f0-9]{64}'/, `const accountHash = '${createHash('sha256').update(setting.account.user.id).digest('hex')}'`);
  vm.runInNewContext(source, sandbox);
  assert.equal(await sandbox.MarieMigration.run({ ...setting, account: { user: { id: 'other-member' } } }, () => {}), null);
  assert.equal(history.length, 0);
  const attempt = await sandbox.MarieMigration.run(setting, () => {});
  assert.equal(attempt.completed, 1);
  assert.equal(attempt.errors.length, 1);
  assert.deepEqual(history, ['verify:correct', 'folder:correct', 'purge:correct', 'verify:incomplet']);
  assert.equal(flags.size, 0);
  await sandbox.MarieMigration.run({ ...setting, records: [record('rattrapé')] }, () => {});
  assert.equal(flags.size, 1);
  assert.equal(await sandbox.MarieMigration.run(setting, () => {}), null);
}

verify().then(verifyMarieMigration).catch(error => { console.error(error); process.exitCode = 1; });

(function (root) {
  'use strict';

  const config = root.DVV_CLOUD_CONFIG;
  const cataloguePrefix = 'catalogue';
  const sharedPrefix = 'shared';
  const bucketName = 'dvv-library';
  const entriesTable = 'dvv_scores';
  const catalogueTable = 'dvv_catalogue';
  const keyPattern = /^[a-f0-9]{64}$/;
  const pilotId = 'belissen-pilote';
  let opening;

  function client() {
    if (!config?.url || !config?.publicKey) throw Error('La bibliothèque en ligne n’est pas encore configurée.');
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        function connect() {
          try { resolve(root.supabase.createClient(config.url, config.publicKey)); }
          catch (error) { reject(Error('Configuration de la bibliothèque incorrecte.', { cause: error })); }
        }
        if (root.supabase) return connect();
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0';
        script.onload = () => root.supabase ? connect() : reject(Error('Connexion à la bibliothèque indisponible.'));
        script.onerror = () => reject(Error('Connexion à la bibliothèque indisponible.'));
        document.head.append(script);
      }).catch(error => { opening = null; throw error; });
    }
    return opening;
  }

  function result({ data, error }, message = 'La bibliothèque en ligne ne répond pas. Réessaie dans un instant.') {
    if (error) throw Error(message, { cause: error });
    return data;
  }

  async function session() {
    if (!config?.url || !config?.publicKey) return null;
    return result(await (await client()).auth.getSession()).session;
  }

  async function connection() {
    const active = await session();
    if (!active) throw Error('Connecte-toi pour accéder à tes partitions en ligne.');
    const db = await client();
    await requireMembership(db, active.user.id);
    return { db, bucket: db.storage.from(bucketName) };
  }

  async function requireMembership(db, userId) {
    const membership = result(await db.from('dvv_members').select('user_id').eq('user_id', userId).maybeSingle());
    if (!membership) throw Error('Ce compte n’a pas accès à la bibliothèque partagée.');
  }

  async function hash(value) {
    const bytes = value instanceof Blob ? await value.arrayBuffer() : value;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function path(prefix, kind, checksum) {
    if (!keyPattern.test(checksum)) throw Error('Référence de fichier invalide.');
    return `${prefix}/${kind}/${checksum}`;
  }

  async function readFile(bucket, prefix, kind, checksum) {
    const data = result(await bucket.download(path(prefix, kind, checksum)), 'Le fichier sauvegardé est indisponible.');
    if (await hash(data) !== checksum) throw Error('La copie en ligne ne correspond pas au fichier attendu.');
    return data;
  }

  async function writeFile(bucket, prefix, kind, checksum, blob, contentType) {
    const uploaded = await bucket.upload(path(prefix, kind, checksum), blob, { contentType, upsert: false });
    if (uploaded.error) await readFile(bucket, prefix, kind, checksum);
  }

  async function summary() {
    const { db } = await connection();
    const [personal, catalogue, folders, locations] = await Promise.all([
      db.from(entriesTable).select('id,title,composer,checksum').order('title'),
      db.from(catalogueTable).select('id,title,composer,checksum').order('title'),
      db.from('dvv_folders').select('id,name').order('name'),
      db.from('dvv_locations').select('score_id,folder_id')
    ]);
    const scores = new Map();
    for (const entry of result(catalogue)) scores.set(entry.id, { ...entry, catalogue: true });
    for (const entry of result(personal)) scores.set(entry.id, entry);
    return { scores: [...scores.values()], folders: result(folders), locations: result(locations) };
  }

  async function getRecord(id) {
    const { db, bucket } = await connection();
    const shared = result(await db.from(entriesTable).select('checksum').eq('id', id).maybeSingle());
    const row = shared || result(await db.from(catalogueTable).select('checksum').eq('id', id).maybeSingle());
    if (!row) return null;
    const prefix = shared ? sharedPrefix : cataloguePrefix;
    const file = await readFile(bucket, prefix, 'bundles', row.checksum);
    const record = JSON.parse(await file.text());
    if (record.id !== id) throw Error('La partition en ligne ne correspond pas à celle demandée.');
    return { record, readAudio: checksum => readFile(bucket, prefix, 'audio', checksum) };
  }

  async function snapshot(record) {
    const { originalFile, created, stats, ...bundle } = record;
    const audio = new Map();
    for (const data of Object.values(bundle.verses || {})) {
      for (const asset of Object.values(data.assets || {}).flat()) {
        if (!asset.cacheId || audio.has(asset.cacheId)) continue;
        const value = await root.PracticeLibrary.getAudio(asset.cacheId);
        if (!value?.blob) throw Error('Un fichier audio de cette partition manque sur cet appareil.');
        audio.set(asset.cacheId, { checksum: await hash(value.blob), blob: value.blob });
      }
    }
    const sourceChecksum = originalFile instanceof Blob ? await hash(originalFile) : null;
    const payload = {
      ...bundle,
      sourceChecksum,
      cloudAudio: Object.fromEntries([...audio].map(([id, file]) => [id, file.checksum]))
    };
    const file = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return { file, checksum: await hash(file), audio, originalFile, sourceChecksum };
  }

  async function transfer(record, { upload = false } = {}) {
    const { db, bucket } = await connection();
    const copy = await snapshot(record);
    const lookup = () => db.from(entriesTable).select('checksum').eq('id', record.id).maybeSingle();
    let existing = result(await lookup());
    if (!existing && upload) {
      for (const { checksum, blob } of copy.audio.values()) await writeFile(bucket, sharedPrefix, 'audio', checksum, blob, 'audio/wav');
      if (copy.sourceChecksum) await writeFile(bucket, sharedPrefix, 'sources', copy.sourceChecksum, copy.originalFile, 'application/octet-stream');
      await writeFile(bucket, sharedPrefix, 'bundles', copy.checksum, copy.file, 'application/json');
      const { error } = await db.from(entriesTable).insert({
        id: record.id, title: record.score.title, composer: record.score.composer || '', checksum: copy.checksum
      });
      if (error && error.code !== '23505') throw Error('Impossible d’inscrire la partition dans la bibliothèque en ligne.', { cause: error });
      existing = result(await lookup());
    }
    if (!existing) throw Error('Cette partition est encore uniquement sur cet appareil.');
    if (existing.checksum !== copy.checksum) throw Error('Une autre version de cette partition existe en ligne. La copie locale a été conservée.');
    await readFile(bucket, sharedPrefix, 'bundles', copy.checksum);
    if (copy.sourceChecksum) await readFile(bucket, sharedPrefix, 'sources', copy.sourceChecksum);
    for (const checksum of new Set([...copy.audio.values()].map(file => file.checksum))) await readFile(bucket, sharedPrefix, 'audio', checksum);
  }

  async function sendCode(email) {
    const db = await client();
    result(await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }), 'Impossible d’envoyer le code de connexion. Vérifie que ton adresse a été autorisée.');
  }
  async function verifyCode(email, token) {
    const db = await client();
    const { user } = result(await db.auth.verifyOtp({ email, token, type: 'email' }), 'Ce code est incorrect ou a expiré.');
    try { await requireMembership(db, user.id); }
    catch (error) { await db.auth.signOut({ scope: 'local' }); throw error; }
  }
  async function signOut() {
    result(await (await client()).auth.signOut({ scope: 'local' }), 'Impossible de te déconnecter.');
  }
  async function saveFolder(name, id) {
    const { db } = await connection();
    const table = db.from('dvv_folders');
    result(await (id ? table.update({ name }).eq('id', id) : table.insert({ name })), 'Impossible d’enregistrer le dossier. Vérifie que ce nom n’est pas déjà utilisé.');
  }
  async function removeFolder(id) {
    const { db } = await connection();
    result(await db.from('dvv_folders').delete().eq('id', id), 'Impossible de supprimer ce dossier.');
  }
  async function move(scoreId, folderId) {
    const { db } = await connection();
    const table = db.from('dvv_locations');
    result(await (folderId ? table.upsert({ score_id: scoreId, folder_id: folderId }, { onConflict: 'score_id' }) : table.delete().eq('score_id', scoreId)), 'Impossible de déplacer cette partition.');
  }

  root.CloudLibrary = {
    configured: Boolean(config?.url && config?.publicKey), cutover: config?.cutover === true, pilotId,
    session, summary, getRecord, transfer, sendCode, verifyCode, signOut, saveFolder, removeFolder, move
  };
})(globalThis);

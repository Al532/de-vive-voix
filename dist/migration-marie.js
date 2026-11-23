'use strict';

// Remove this module and its script tag after Marie's legacy imports are moved.
globalThis.MarieMigration = {
  async run({ account, folders, records }, progress) {
    const accountHash = '7588408f507dee7e535ff117640341db94669ea600813d19a41f85935623eae9';
    const folderId = '5a4094c9-757f-4299-8673-52f4c6545e01';
    const completedKey = 'de-vive-voix:legacy-marie:noel-2026';
    if (!account?.user.id || !records.length) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(account.user.id));
    const currentAccountHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (currentAccountHash !== accountHash) return null;
    try { if (localStorage.getItem(completedKey)) return null; }
    catch { /* The copy can be safely retried if the browser denies this flag. */ }

    const folder = folders.find(entry => entry.id === folderId);
    if (!folder) return { completed: 0, errors: ['Le dossier de destination est introuvable. Les copies locales ont été conservées.'] };

    const errors = [];
    let completed = 0;
    for (const [index, record] of records.entries()) {
      progress(`Transfert des partitions de cet appareil. Partition ${index + 1} sur ${records.length}.`);
      try {
        await CloudLibrary.transfer(record, { upload: true });
        await CloudLibrary.move(record.id, folder.id);
        if (!await PracticeLibrary.remove(record.id, record)) throw Error('La copie locale a changé pendant le transfert.');
        completed++;
      } catch (error) {
        errors.push(`${record.score.title} — ${error.message}`);
      }
    }

    if (!errors.length) {
      try { localStorage.setItem(completedKey, '1'); }
      catch { /* Verified and removed records no longer qualify for migration. */ }
    }
    return { folder, completed, errors };
  }
};

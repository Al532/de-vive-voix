'use strict';

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
const titleOf = score => [score.title, score.composer].filter(Boolean).join(' — ');
const status = message => { ui.libraryStatus.textContent = message; };
let localRecords = [], running = false;

function make(tag, text) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}

function button(label, type = 'button') {
  const element = make('button', label);
  element.type = type;
  return element;
}

function linkTo(id, title) {
  const link = make('a', title);
  link.href = ScoreNavigation.readerUrl(id);
  return link;
}

function action(handler) {
  return async event => {
    event.preventDefault();
    if (running) return;
    running = true;
    try { await handler(); }
    catch (error) { status(error.message); }
    finally { running = false; }
  };
}

function scoreRow(score, folders, location) {
  const title = titleOf(score), row = make('li');
  row.append(linkTo(score.id, title));
  if (!folders.length) return row;
  const details = make('details'), form = make('form'), select = make('select');
  const label = make('label', 'Dossier de destination pour « ' + title + ' »');
  select.id = 'destination-' + score.id;
  label.htmlFor = select.id;
  select.append(new Option('Sans dossier', ''));
  for (const folder of folders) select.append(new Option(folder.name, folder.id));
  select.value = location || '';
  form.append(label, select, button('Déplacer', 'submit'));
  form.onsubmit = action(async () => {
    await CloudLibrary.move(score.id, select.value);
    await refresh();
    byId('folder-' + (select.value || 'root'))?.focus();
    status('« ' + title + ' » a été déplacée.');
  });
  details.append(make('summary', 'Déplacer « ' + title + ' »'), form);
  row.append(details);
  return row;
}

function folderSection(folder, scores, folders, assignments) {
  const section = make('section'), heading = make('h3', folder?.name || 'Sans dossier');
  heading.id = 'folder-' + (folder?.id || 'root');
  heading.tabIndex = -1;
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading);
  if (scores.length) {
    const list = make('ul');
    for (const score of scores) list.append(scoreRow(score, folders, assignments.get(score.id)));
    section.append(list);
  } else section.append(make('p', 'Aucune partition.'));
  if (!folder) return section;
  const details = make('details'), rename = make('form'), label = make('label', 'Nouveau nom du dossier « ' + folder.name + ' »');
  const input = make('input');
  input.id = 'rename-' + folder.id;
  input.required = true;
  input.maxLength = 120;
  input.value = folder.name;
  label.htmlFor = input.id;
  rename.append(label, input, button('Renommer', 'submit'));
  rename.onsubmit = action(async () => {
    if (!input.value.trim()) { input.focus(); throw Error('Saisis un nom de dossier.'); }
    await CloudLibrary.saveFolder(input.value.trim(), folder.id);
    await refresh();
    byId(heading.id)?.focus();
    status('Dossier renommé.');
  });
  const remove = button('Supprimer le dossier « ' + folder.name + ' »');
  remove.onclick = action(async () => {
    if (!window.confirm('Supprimer le dossier « ' + folder.name + ' » ? Ses partitions reviendront dans « Sans dossier ».')) return;
    await CloudLibrary.removeFolder(folder.id);
    await refresh();
    ui.onlineTitle.focus();
    status('Dossier supprimé. Les partitions sont dans « Sans dossier ».');
  });
  details.append(make('summary', 'Gérer le dossier « ' + folder.name + ' »'), rename, remove);
  section.append(details);
  return section;
}

async function refresh() {
  localRecords = await PracticeLibrary.listLocal().catch(() => []);
  const connected = await CloudLibrary.session();
  ui.account.hidden = !CloudLibrary.configured || Boolean(connected);
  ui.onlineLibrary.hidden = !connected;
  ui.signOut.hidden = !connected;
  const showLocal = localRecords.length > 0;
  ui.localLibrary.hidden = !showLocal;
  ui.migrate.hidden = !connected || !showLocal;
  ui.purge.hidden = !connected || !showLocal;
  ui.localList.replaceChildren();
  for (const record of localRecords) {
    const item = make('li');
    item.append(linkTo(record.id, titleOf(record.score)));
    ui.localList.append(item);
  }
  if (!connected) return;
  const { scores, folders, locations } = await CloudLibrary.summary();
  const assignments = new Map(locations.map(item => [item.score_id, item.folder_id]));
  const ordered = scores.sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'fr'));
  ui.folderList.replaceChildren(folderSection(null, ordered.filter(s => !assignments.has(s.id)), folders, assignments));
  for (const folder of folders) ui.folderList.append(folderSection(folder, ordered.filter(s => assignments.get(s.id) === folder.id), folders, assignments));
}

async function transferLocal(upload) {
  const entries = await PracticeLibrary.listLocal();
  let completed = 0;
  const errors = [];
  ui.migrationErrors.hidden = true;
  for (const record of entries) {
    status((upload ? 'Copie' : 'Vérification') + ' de la partition ' + (completed + errors.length + 1) + ' sur ' + entries.length + '.');
    try {
      await CloudLibrary.transfer(record, { upload });
      if (!upload && !await PracticeLibrary.remove(record.id, record)) throw Error('La copie locale a changé. Elle a été conservée.');
      completed++;
    } catch (error) { errors.push(titleOf(record.score) + ' : ' + error.message); }
  }
  ui.migrationErrors.replaceChildren(...errors.map(message => make('li', message)));
  ui.migrationErrors.hidden = !errors.length;
  ui.confirmPurge.hidden = true;
  await refresh();
  const trigger = upload ? ui.migrate : ui.purge;
  (trigger.hidden ? ui.libraryTitle : trigger).focus();
  status(completed + ' sur ' + entries.length + (upload ? ' partitions vérifiées en ligne.' : ' copies locales retirées.') + (errors.length ? ' Les autres copies locales sont conservées.' : ''));
}

ui.loginForm.onsubmit = action(async () => {
  await CloudLibrary.signIn(ui.email.value.trim(), ui.password.value);
  ui.password.value = '';
  await refresh();
  ui.onlineTitle.focus();
  status('Connexion réussie.');
});
ui.signOut.onclick = action(async () => {
  await CloudLibrary.signOut();
  await refresh();
  ui.email.focus();
  status('Déconnexion réussie.');
});
ui.folderForm.onsubmit = action(async () => {
  const name = ui.folderName.value.trim();
  if (!name) { ui.folderName.focus(); throw Error('Saisis un nom de dossier.'); }
  await CloudLibrary.saveFolder(name);
  ui.folderName.value = '';
  await refresh();
  status('Dossier « ' + name + ' » créé.');
});
ui.migrate.onclick = action(() => transferLocal(true));
ui.purge.onclick = action(async () => { ui.confirmPurge.hidden = false; ui.applyPurge.focus(); });
ui.cancelPurge.onclick = action(async () => { ui.confirmPurge.hidden = true; ui.purge.focus(); });
ui.applyPurge.onclick = action(() => transferLocal(false));
if (CloudLibrary.cutover) ui.readerLink.hidden = true;
refresh().then(() => status(CloudLibrary.configured ? '' : 'La bibliothèque en ligne n’est pas encore configurée.')).catch(error => status(error.message));
window.addEventListener('pageshow', event => {
  if (event.persisted && !running) refresh().catch(error => status(error.message));
});

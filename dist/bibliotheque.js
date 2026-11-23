'use strict';

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
const titleOf = score => [score.title, score.composer].filter(Boolean).join(' — ');
const status = message => { ui.libraryStatus.textContent = message; };
let localRecords = [], onlineModel, selectedFolder = '', running = false;

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
  const details = make('details');
  details.append(make('summary', 'Gérer « ' + title + ' »'));
  if (folders.length) details.append(moveForm(score, folders, location));
  const remove = button('Supprimer la partition');
  remove.onclick = action(async () => {
    if (!window.confirm('Supprimer « ' + title + ' » de la bibliothèque partagée pour les deux comptes ?')) return;
    await CloudLibrary.removeScore(score);
    await refresh();
    (byId('folder-' + (location || 'root')) || ui.folderFilter).focus();
    status('« ' + title + ' » a été retirée de la bibliothèque partagée.');
  });
  details.append(remove);
  row.append(details);
  return row;
}

function moveForm(score, folders, location) {
  const form = make('form'), select = make('select');
  const title = titleOf(score);
  const label = make('label', 'Dossier de destination pour « ' + title + ' »');
  select.id = 'destination-' + score.id;
  label.htmlFor = select.id;
  select.append(new Option('Sans dossier', ''));
  for (const folder of folders) select.append(new Option(folder.name, folder.id));
  select.value = location || '';
  form.append(label, select, button('Déplacer', 'submit'));
  form.onsubmit = action(async () => {
    const folder = select.value;
    await CloudLibrary.move(score.id, folder);
    if (selectedFolder) selectedFolder = folder || ScoreNavigation.noFolder;
    await refresh();
    (byId('folder-' + (folder || 'root')) || ui.folderFilter).focus();
    status('« ' + title + ' » a été déplacée.');
  });
  return form;
}

function localRow(record) {
  const title = titleOf(record.score), item = make('li'), details = make('details');
  const remove = button('Supprimer la copie de cet appareil');
  remove.onclick = action(async () => {
    if (!window.confirm('Supprimer la copie de « ' + title + ' » de cet appareil ?')) return;
    await PracticeLibrary.remove(record.id);
    await refresh();
    (ui.localLibrary.hidden ? ui.libraryTitle : ui.localTitle).focus();
    status('Copie locale retirée.');
  });
  details.append(make('summary', 'Gérer la copie de « ' + title + ' »'), remove);
  item.append(linkTo(record.id, title), details);
  return item;
}

function folderSection(folder, scores, folders, assignments) {
  const section = make('section'), heading = make('h2', folder?.name || 'Sans dossier');
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
    ui.folderFilter.focus();
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
  for (const record of localRecords) ui.localList.append(localRow(record));
  onlineModel = connected ? await CloudLibrary.summary() : null;
  if (onlineModel) renderLibrary();
  else ui.folderList.replaceChildren();
  return connected;
}

function renderLibrary() {
  const { scores, folders, locations } = onlineModel;
  const choices = ScoreNavigation.folderOptions(folders);
  if (!choices.some(choice => choice.id === selectedFolder)) selectedFolder = '';
  ui.folderFilter.replaceChildren(...choices.map(choice => new Option(choice.name, choice.id)));
  ui.folderFilter.value = selectedFolder;
  const assignments = ScoreNavigation.folderAssignments(locations);
  const ordered = [...scores].sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'fr'));
  const sections = [null, ...folders].filter(folder => !selectedFolder || (folder?.id || ScoreNavigation.noFolder) === selectedFolder);
  ui.folderList.replaceChildren(...sections.map(folder => folderSection(folder, ScoreNavigation.scoresInFolder(ordered, assignments, folder?.id || ScoreNavigation.noFolder), folders, assignments)));
}

function showMigrationErrors(errors) {
  ui.migrationErrors.replaceChildren(...errors.map(message => make('li', message)));
  ui.migrationErrors.hidden = !errors.length;
}

async function openLibrary() {
  const account = await refresh();
  status(account || CloudLibrary.configured ? '' : 'La bibliothèque en ligne n’est pas encore configurée.');
}

async function transferLocal(upload) {
  const entries = await PracticeLibrary.listLocal();
  let completed = 0;
  const errors = [];
  ui.migrationErrors.hidden = true;
  for (const record of entries) {
    status((upload ? 'Copie' : 'Vérification') + ' de la partition ' + (completed + errors.length + 1) + ' sur ' + entries.length + '.');
    try {
      await CloudLibrary.transfer(record, { upload, restore: upload });
      if (!upload && !await PracticeLibrary.remove(record.id, record)) throw Error('La copie locale a changé. Elle a été conservée.');
      completed++;
    } catch (error) { errors.push(titleOf(record.score) + ' : ' + error.message); }
  }
  showMigrationErrors(errors);
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
  if (onlineModel?.scores.length && new URLSearchParams(location.search).get('connexion') === 'lecture') {
    location.replace('index.html');
    return;
  }
  ui.folderFilter.focus();
  status('Connexion réussie.');
});
ui.signOut.onclick = action(async () => {
  await CloudLibrary.signOut();
  await refresh();
  showMigrationErrors([]);
  ui.email.focus();
  status('Déconnexion réussie.');
});
ui.folderFilter.onchange = action(async () => {
  selectedFolder = ui.folderFilter.value;
  renderLibrary();
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
running = true;
openLibrary().catch(error => status(error.message)).finally(() => { running = false; });
window.addEventListener('pageshow', event => {
  if (event.persisted && !running) refresh().catch(error => status(error.message));
});

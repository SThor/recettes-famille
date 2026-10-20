// Récupération des propositions de la famille vers le vault (deploy/recuperer-propositions.sh),
// testée contre un « serveur » local : la commande SSH est remplacée par `bash -c`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'deploy', 'recuperer-propositions.sh');
const GIT_BASH = 'C:/Program Files/Git/bin/bash.exe';
const BASH = process.platform === 'win32' ? (fs.existsSync(GIT_BASH) ? GIT_BASH : null) : 'bash';
const skip = !BASH && 'bash introuvable';

let root, data, vault;
const ID = '2026-10-15T10-00-00-000Z-abc123';
const FOLDER = '2026-10-15 - Gratin aux épinards';

function propose(id, info, photos = []) {
  const dir = path.join(data, 'a-moderer', id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of photos) fs.writeFileSync(path.join(dir, name), content);
  fs.writeFileSync(path.join(dir, 'recette.json'), JSON.stringify({ photos: photos.map(p => p[0]), ...info }));
}

test.beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'recettes-props-'));
  data = path.join(root, 'serveur-data');
  vault = path.join(root, 'vault', 'Propositions');
  fs.mkdirSync(path.join(data, 'a-moderer'), { recursive: true });
  propose(ID, { prenom: 'Carole', titre: 'Gratin aux épinards', texte: '500 g d\'épinards\n\nMélanger.', anecdote: 'Mon plat préféré', date: '15/10/2026 12:00:00' },
    [['photo-1.jpg', 'image-1'], ['photo-2.png', 'image-2']]);
});
test.afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const run = () => spawnSync(BASH, [SCRIPT], {
  env: { ...process.env, PROPOSITIONS_SSH: 'bash -c', PROPOSITIONS_DATA: data.replace(/\\/g, '/'), PROPOSITIONS_DEST: vault.replace(/\\/g, '/') },
  encoding: 'utf8',
});
const read = (...p) => fs.readFileSync(path.join(vault, ...p), 'utf8');

test('copie chaque proposition dans le vault : note Obsidian + photos', { skip }, () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const md = read(FOLDER, 'Gratin aux épinards.md');
  assert.match(md, /^---\ntype: proposition\nproposee_par: Carole\ndate: 2026-10-15\nstatut: à traiter\n---\n/);
  assert.match(md, /# Gratin aux épinards/);
  assert.match(md, /Proposée sur le site par \*\*Carole\*\* le 15\/10\/2026 12:00:00/);
  assert.match(md, /## Recette\n\n500 g d'épinards\n\nMélanger\./);
  assert.match(md, /## Anecdote\n\nMon plat préféré/);
  assert.match(md, /!\[\[photo-1\.jpg\]\]\n!\[\[photo-2\.png\]\]/);
  assert.equal(read(FOLDER, 'photo-1.jpg'), 'image-1');
  assert.equal(read(FOLDER, 'photo-2.png'), 'image-2');
  assert.match(r.stdout, /1 proposition récupérée/);
});

test('côté serveur : rangée dans importees, rien de supprimé', { skip }, () => {
  run();
  assert.deepEqual(fs.readdirSync(path.join(data, 'a-moderer')), []);
  const moved = path.join(data, 'importees', ID);
  assert.deepEqual(fs.readdirSync(moved).sort(), ['photo-1.jpg', 'photo-2.png', 'recette.json']);
});

test('relancer ne réimporte rien', { skip }, () => {
  run();
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Aucune proposition en attente/);
  assert.deepEqual(fs.readdirSync(vault), [FOLDER]);
});

test('n\'écrase jamais un dossier déjà présent dans le vault (déjà importé ou retravaillé)', { skip }, () => {
  fs.mkdirSync(path.join(vault, FOLDER), { recursive: true });
  fs.writeFileSync(path.join(vault, FOLDER, 'Gratin aux épinards.md'), 'retravaillé par l\'agent');
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(read(FOLDER, 'Gratin aux épinards.md'), 'retravaillé par l\'agent');
  assert.ok(fs.existsSync(path.join(data, 'importees', ID)), 'rangée quand même côté serveur');
});

test('un titre avec des caractères interdits donne un nom de dossier valide', { skip }, () => {
  propose('2026-10-16T09-00-00-000Z-def456', { prenom: 'Marc', titre: 'Tarte: pommes/poires?', texte: 'x', date: '16/10/2026' });
  assert.equal(run().status, 0);
  assert.ok(fs.existsSync(path.join(vault, '2026-10-16 - Tarte pommespoires', 'Tarte pommespoires.md')));
});

test('aucune proposition : message et rien d\'autre', { skip }, () => {
  fs.rmSync(path.join(data, 'a-moderer', ID), { recursive: true });
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Aucune proposition en attente/);
  assert.ok(!fs.existsSync(vault) || fs.readdirSync(vault).length === 0);
});

test('une demande est importée dans le vault comme une proposition', { skip }, () => {
  propose('2026-10-16T09-00-00-000Z-dem001', { type: 'demande', prenom: 'Paul', titre: 'Polenta', texte: '', note: 'Kenza (femme de [[Lou-Anne]])', categorie: 'Desserts', date: '16/10/2026' });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const md = read('2026-10-16 - Polenta', 'Polenta.md');
  assert.match(md, /^type: proposition$/m);
  assert.match(md, /Demandée sur le site par \*\*Paul\*\* le 16\/10\/2026\./);
  assert.match(md, /## Demande\n\nDesserts — Kenza \(femme de \[\[Lou-Anne\]\]\)\n/);
  assert.match(md, /## Recette\n\n\(à demander\)/);
  assert.ok(fs.existsSync(path.join(data, 'importees', '2026-10-16T09-00-00-000Z-dem001', 'recette.json')));
});

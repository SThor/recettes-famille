// Teste deploy/sync-recettes.sh entre un « vault » et un « serveur » locaux.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { makeRecipesRepo, git } = require('./helpers');

const SCRIPT = path.join(__dirname, '..', 'deploy', 'sync-recettes.sh');
// Sous Windows, prendre le bash de Git (et pas celui de WSL).
const GIT_BASH = 'C:/Program Files/Git/bin/bash.exe';
const BASH = process.platform === 'win32' ? (fs.existsSync(GIT_BASH) ? GIT_BASH : null) : 'bash';

let root, server, vault;
test.beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'recettes-sync-'));
  server = makeRecipesRepo(root);
  vault = path.join(root, 'vault');
  git(root, 'clone', '-q', '-c', 'core.autocrlf=false', server, vault);
  git(vault, 'config', 'user.name', 'Paul (Obsidian)');
  git(vault, 'config', 'user.email', 'paul@test');
});
test.afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const sync = () => spawnSync(BASH, [SCRIPT], { env: { ...process.env, RECIPES_DIR: vault }, encoding: 'utf8' });
const write = (dir, f, s) => fs.writeFileSync(path.join(dir, f), s);
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
// Simule une écriture du site : fichier modifié puis commité sur le serveur.
function siteEdit(f, transform) {
  write(server, f, transform(read(server, f)));
  git(server, 'commit', '-q', '-am', `Site : ${f}`);
}

test('modifs des deux côtés sur des fichiers différents : tout est fusionné', { skip: !BASH && 'bash introuvable' }, () => {
  siteEdit('Pounty.cook', s => s.replace('checked by:', 'checked by: Aline 2026-10-15'));
  write(vault, 'Galette sèche.cook', read(vault, 'Galette sèche.cook').replace('servings:', 'servings: 8'));
  write(vault, 'Nouvelle.cook', '---\ntitle: Nouvelle\n---\n');

  const r = sync();
  assert.equal(r.status, 0, r.stdout + r.stderr);

  for (const dir of [vault, server]) {
    assert.match(read(dir, 'Pounty.cook'), /checked by: Aline/);
    assert.match(read(dir, 'Galette sèche.cook'), /servings: 8/);
    assert.ok(fs.existsSync(path.join(dir, 'Nouvelle.cook')));
  }
  assert.equal(git(server, 'status', '--porcelain'), '', 'le dossier du serveur est à jour et propre');
});

test('rien à faire : ne crée pas de commit', { skip: !BASH && 'bash introuvable' }, () => {
  const before = git(vault, 'rev-parse', 'HEAD');
  assert.equal(sync().status, 0);
  assert.equal(git(vault, 'rev-parse', 'HEAD'), before);
});

test('conflit : s\'arrête sans rien écraser', { skip: !BASH && 'bash introuvable' }, () => {
  siteEdit('Pounty.cook', s => s.replace('servings: 6', 'servings: 7'));
  write(vault, 'Pounty.cook', read(vault, 'Pounty.cook').replace('servings: 6', 'servings: 9'));

  const r = sync();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Conflit/);
  assert.match(read(server, 'Pounty.cook'), /servings: 7/, 'le serveur garde sa version');

  // La version du vault est toujours récupérable.
  git(vault, 'rebase', '--abort');
  assert.match(read(vault, 'Pounty.cook'), /servings: 9/);
});

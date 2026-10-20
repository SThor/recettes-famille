#!/usr/bin/env node
// Met en forme une proposition téléchargée du serveur pour le vault Obsidian :
//   node proposition-md.js <dossier de la proposition> <dossier Propositions du vault>
// Crée « <date> - <titre>/ » avec « <titre>.md » (note Obsidian) et les photos.
// N'écrase jamais un dossier existant (déjà importé, ou retravaillé par l'agent du vault).
// Affiche « importee <dossier> », « deja-present <dossier> » ou « demande <titre> » (laissée sur le serveur).
const fs = require('fs');
const path = require('path');

const [src, destRoot] = process.argv.slice(2);
const id = path.basename(src);
const info = JSON.parse(fs.readFileSync(path.join(src, 'recette.json'), 'utf8'));

// Nom de fichier sûr (Windows + Obsidian) : sans \ / : * ? " < > | # ^ [ ]
const safe = s => String(s || '').replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Recette';
const titre = safe(info.titre);
const date = id.slice(0, 10); // l'identifiant commence par la date ISO
const folder = path.join(destRoot, `${date} - ${titre}`);

// Demande encore vide (rien que le titre) : elle se rédige dans l'admin du site, pas dans le vault.
if (info.type === 'demande' && !String(info.texte || '').trim() && !(info.photos || []).length) {
  console.log(`demande ${info.titre || titre}`);
  process.exit(0);
}

if (fs.existsSync(folder)) {
  console.log(`deja-present ${path.basename(folder)}`);
  process.exit(0);
}

const photos = (info.photos || []).filter(p => /^[\w.-]+$/.test(p) && fs.existsSync(path.join(src, p)));
const yaml = s => JSON.stringify(String(s || '')); // valeur YAML sûre (guillemets si besoin)
const md = [
  '---',
  'type: proposition',
  `proposee_par: ${/^[\p{L} '-]+$/u.test(info.prenom || '') ? info.prenom : yaml(info.prenom)}`,
  `date: ${date}`,
  'statut: à traiter',
  '---',
  `# ${info.titre || titre}`,
  '',
  `Proposée sur le site par **${info.prenom || '?'}** le ${info.date || date}.`,
  '',
  '## Recette',
  '',
  String(info.texte || '(pas de texte, voir les photos)').replace(/\r\n/g, '\n').trim(),
  '',
  ...(info.anecdote ? ['## Anecdote', '', String(info.anecdote).replace(/\r\n/g, '\n').trim(), ''] : []),
  ...(photos.length ? ['## Photos', '', ...photos.map(p => `![[${p}]]`), ''] : []),
].join('\n');

// Écriture dans un dossier temporaire puis renommage : jamais de dossier à moitié rempli.
const tmp = `${folder}.tmp-${process.pid}`;
fs.mkdirSync(tmp, { recursive: true });
for (const p of photos) fs.copyFileSync(path.join(src, p), path.join(tmp, p));
fs.writeFileSync(path.join(tmp, `${titre}.md`), md);
fs.renameSync(tmp, folder);
console.log(`importee ${path.basename(folder)}`);

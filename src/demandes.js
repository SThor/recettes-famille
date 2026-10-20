// Demandes de recettes = propositions sans contenu (type « demande »), rangées avec les autres
// dans data/a-moderer/. Au démarrage, reprend une fois pour toutes la liste « À demander.md » :
// chaque ligne devient une demande (cochée → traitees/), le fichier est conservé tel quel,
// avec une ligne qui signale la reprise (et sert de marque pour ne pas recommencer).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseTodo, serializeTodo } = require('./todo');
const { COURSES } = require('./recipes');
const { writeAtomic, today } = require('./files');

const TODO_FILE = 'À demander.md';
const MARK = 'Liste reprise par le site le';

// Dossiers des propositions, selon leur état (rien n'est jamais supprimé : on déplace).
const statesOf = dataDir => ({ pending: path.join(dataDir, 'a-moderer'), done: path.join(dataDir, 'traitees'), archived: path.join(dataDir, 'archivees'), imported: path.join(dataDir, 'importees') });

const newId = () => `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
const frDate = () => new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

// Crée une demande dans le dossier donné (a-moderer, ou traitees pour une ligne déjà cochée).
function createDemande(base, fields) {
  const id = newId();
  const dir = path.join(base, id);
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, 'recette.json'), JSON.stringify({ type: 'demande', texte: '', photos: [], date: frDate(), ...fields }, null, 2));
  return id;
}

// « Desserts » → « dessert » (clé de course), sinon vide.
function courseOf(categorie) {
  const c = String(categorie || '').trim().toLowerCase();
  const hit = COURSES.find(([key, label]) => key === c || label.toLowerCase() === c);
  return hit ? hit[0] : '';
}

async function migrateTodo({ dir, git, states }) {
  const full = path.join(dir, TODO_FILE);
  if (!fs.existsSync(full)) return 0;
  const doc = parseTodo(fs.readFileSync(full, 'utf8'));
  if (doc.head.some(l => l.includes(MARK))) return 0;

  // Déjà reprises (démarrage interrompu avant la marque) : pas de doublon.
  const seen = new Set();
  for (const base of Object.values(states)) {
    if (!fs.existsSync(base)) continue;
    for (const id of fs.readdirSync(base)) {
      try {
        const info = JSON.parse(fs.readFileSync(path.join(base, id, 'recette.json'), 'utf8'));
        if (info.repriseDe === TODO_FILE) seen.add(`${info.categorie}|${info.titre}`);
      } catch { /* dossier incomplet : ignoré */ }
    }
  }
  let count = 0;
  for (const s of doc.sections) {
    for (const e of s.entries) {
      if (e.type !== 'item' || seen.has(`${s.title}|${e.title}`)) continue;
      const fields = { prenom: TODO_FILE, titre: e.title, note: e.note, categorie: s.title, repriseDe: TODO_FILE };
      if (e.done) createDemande(states.done, { ...fields, recue: true, traiteeLe: today(), traiteePar: 'reprise' });
      else createDemande(states.pending, fields);
      count++;
    }
  }
  await git.write('Site : liste « À demander » reprise dans les propositions', 'Site', () => {
    doc.head.push(`> ${MARK} ${today()} (Suivi → Propositions) : ne plus la modifier ici.`);
    writeAtomic(full, serializeTodo(doc));
  });
  console.log(`${count} demande(s) reprise(s) de « ${TODO_FILE} ».`);
  return count;
}

module.exports = { statesOf, createDemande, courseOf, migrateTodo };

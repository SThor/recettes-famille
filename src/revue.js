// Relecture par la famille. Les questions ouvertes sont les commentaires Cooklang du corps
// (`-- …` et `[- … -]`), invisibles dans le livre. On y répond depuis le site : la réponse est
// ajoutée DANS le commentaire (« question ↳ Prénom : réponse »), sans jamais ajouter de ligne,
// car une ligne de commentaire seule au milieu d'un paragraphe coupe l'étape en deux.
const ANSWER = '↳';

// Début du corps (après l'en-tête YAML éventuel).
function bodyStart(src) {
  const bom = src.startsWith('﻿') ? 1 : 0;
  const m = src.slice(bom).match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return bom + (m ? m[0].length : 0);
}

// Commentaires du corps, dans l'ordre : { text, at, end, kind }.
// `end` = où ajouter une réponse (fin de ligne, ou juste avant le `-]` d'un bloc).
function comments(src) {
  const start = bodyStart(src);
  const found = [];
  // Les blocs sont relevés d'abord puis remplacés par des espaces (positions conservées).
  const masked = src.slice(start).replace(/\[-([\s\S]*?)-\]/g, (all, inner, offset) => {
    found.push({ kind: 'block', text: inner.trim(), at: start + offset, end: start + offset + all.length - 2 });
    return ' '.repeat(all.length);
  });
  let pos = start;
  for (const line of masked.split('\n')) {
    const content = line.replace(/\r$/, '');
    const m = content.match(/(?:^|\s)--(?!-)\s*(.*)$/);
    if (m && m[1].trim()) found.push({ kind: 'line', text: m[1].trim(), at: pos + m.index, end: pos + content.trimEnd().length });
    pos += line.length + 1;
  }
  return found.sort((a, b) => a.at - b.at);
}

// « question ↳ Carole : réponse ↳ Paul : … » → { question, answers: [{ who, text }] }
function threadOf(text) {
  const [question, ...answers] = text.split(/\s*↳\s*/);
  return {
    question: question.trim(),
    answers: answers.map(a => {
      const i = a.indexOf(' : ');
      return i > 0 ? { who: a.slice(0, i).trim(), text: a.slice(i + 3).trim() } : { who: '', text: a.trim() };
    }),
  };
}

const questionsOf = src => comments(src).map(c => c.text);
const threadsOf = src => comments(src).map(c => threadOf(c.text));

// Texte saisi sur le site → une ligne, sans rien qui puisse fermer le commentaire ou en ouvrir un autre.
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').replace(/↳/g, '→')
  .replace(/\[-/g, '[ -').replace(/-\]/g, '- ]').trim().slice(0, 2000);

// Ajoute la réponse à la question n° index (vérifiée par son texte : le fichier a pu changer ;
// sinon on la cherche par son texte). Renvoie le nouveau source, ou null si la question n'existe plus.
function answerQuestion(src, { index, question }, who, text) {
  const list = comments(src);
  const same = c => c && threadOf(c.text).question === question;
  const c = same(list[Number(index)]) ? list[Number(index)] : list.find(same);
  if (!c) return null;
  const before = src.slice(0, c.end);
  const sep = c.kind === 'block' && !/\s$/.test(before) ? ' ' : c.kind === 'line' ? ' ' : '';
  return `${before}${sep}${ANSWER} ${oneLine(who)} : ${oneLine(text)}${c.kind === 'block' ? ' ' : ''}${src.slice(c.end)}`;
}

// Erreur signalée : un paragraphe de commentaire en fin de recette (devient une question ouverte).
function reportError(src, who, text) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  return `${src.replace(/\s*$/, '')}${eol}${eol}-- ⚠ Erreur signalée par ${oneLine(who)} : ${oneLine(text)}${eol}`;
}

// Prénom saisi à la connexion ou dans un formulaire : une ligne courte, majuscule initiale.
function cleanName(s) {
  const name = String(s ?? '').replace(/[\s:↳<>]+/g, ' ').trim().slice(0, 40);
  return name.charAt(0).toLocaleUpperCase('fr') + name.slice(1);
}

module.exports = { questionsOf, threadsOf, answerQuestion, reportError, cleanName, oneLine };

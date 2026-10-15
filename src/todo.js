// Lecture / écriture de « À demander.md » : un en-tête libre, puis des sections
// `## Catégorie` contenant des lignes `- [ ] Recette — commentaire`.
// Toute ligne non reconnue est conservée telle quelle, pour ne rien perdre.
const ITEM = /^- \[( |x|X)\] (.*)$/;

function parseTodo(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const doc = { head: [], sections: [], nl: src.includes('\r\n') ? '\r\n' : '\n' };
  let section = null;
  for (const line of lines) {
    const h = line.match(/^## (.+)$/);
    if (h) { section = { title: h[1].trim(), entries: [] }; doc.sections.push(section); continue; }
    if (!section) { doc.head.push(line); continue; }
    const m = line.match(ITEM);
    if (m) {
      const [title, ...rest] = m[2].split(' — ');
      section.entries.push({ type: 'item', done: m[1] !== ' ', title: title.trim(), note: rest.join(' — ').trim() });
    } else {
      section.entries.push({ type: 'raw', line });
    }
  }
  // Retire les lignes vides de fin de section (réajoutées à l'écriture).
  for (const s of doc.sections) while (s.entries.length && s.entries.at(-1).type === 'raw' && !s.entries.at(-1).line.trim()) s.entries.pop();
  while (doc.head.length && !doc.head.at(-1).trim()) doc.head.pop();
  // Identifiants stables le temps d'une page : section.index
  doc.sections.forEach((s, si) => s.entries.forEach((e, ei) => { e.id = `${si}.${ei}`; }));
  return doc;
}

function serializeTodo(doc) {
  const out = [...doc.head, ''];
  for (const s of doc.sections) {
    out.push(`## ${s.title}`);
    for (const e of s.entries) {
      out.push(e.type === 'raw' ? e.line : `- [${e.done ? 'x' : ' '}] ${e.title}${e.note ? ` — ${e.note}` : ''}`);
    }
    out.push('');
  }
  return out.join(doc.nl || '\n');
}

function findItem(doc, id) {
  const [si, ei] = String(id).split('.').map(Number);
  const e = doc.sections[si]?.entries[ei];
  return e?.type === 'item' ? { section: doc.sections[si], index: ei, item: e } : null;
}

module.exports = { parseTodo, serializeTodo, findItem };

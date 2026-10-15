// Mini parseur Cooklang : couvre ce qu'utilisent nos recettes
// (en-tête YAML, @ingrédients, #ustensiles, ~minuteurs, notes `>`, commentaires `--` et `[- -]`).
const YAML = require('yaml');

const TOKEN = /([@#~])(?:([^@#~{}\n]*?)\{([^}]*)\}|([\p{L}\p{N}_'’-]+))/gu;

function parseQuantity(raw) {
  const [q = '', u = ''] = raw.split('%').map(s => s.trim());
  return { quantity: q, unit: u, value: toNumber(q) };
}

function toNumber(q) {
  if (!q) return null;
  const frac = q.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(q.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseLine(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    const [, sigil, multiName, braces, singleName] = m;
    let name = (multiName ?? singleName ?? '').trim();
    const optional = name.startsWith('?');
    name = name.replace(/^[?&-]+/, '');
    const q = braces !== undefined ? parseQuantity(braces) : { quantity: '', unit: '', value: null };
    const type = sigil === '@' ? 'ingredient' : sigil === '#' ? 'cookware' : 'timer';
    parts.push({ type, name, optional, ...q });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

function splitFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  return { meta: YAML.parse(m[1]) || {}, body: src.slice(m[0].length) };
}

function parse(src) {
  const { meta, body } = splitFrontmatter(src.replace(/^﻿/, ''));
  const cleaned = body
    .replace(/\[-[\s\S]*?-\]/g, '')
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)--.*$/, '').trimEnd());

  // Blocs : paragraphes d'étapes ou groupes de notes, dans l'ordre du fichier.
  const blocks = [];
  let current = null;
  for (const line of cleaned) {
    if (!line.trim()) { current = null; continue; }
    const isNote = line.startsWith('>');
    const kind = isNote ? 'note' : 'step';
    const text = isNote ? line.replace(/^>\s?/, '') : line.trim();
    if (!current || current.kind !== kind) {
      current = { kind, lines: [] };
      blocks.push(current);
    }
    current.lines.push(text);
  }

  const items = blocks.map(b =>
    b.kind === 'note'
      ? { type: 'note', lines: b.lines }
      : { type: 'step', parts: parseLine(b.lines.join(' ')) }
  );

  const ingredients = [];
  const cookware = [];
  for (const item of items) {
    if (item.type !== 'step') continue;
    for (const p of item.parts) {
      if (p.type === 'ingredient') addIngredient(ingredients, p);
      if (p.type === 'cookware' && !cookware.some(c => c.toLowerCase() === p.name.toLowerCase())) cookware.push(p.name);
    }
  }
  return { meta, items, ingredients, cookware };
}

// Regroupe les ingrédients du même nom ; additionne si même unité et quantités numériques.
function addIngredient(list, p) {
  let ing = list.find(i => i.name.toLowerCase() === p.name.toLowerCase());
  if (!ing) list.push(ing = { name: p.name, optional: p.optional, amounts: [] });
  if (!p.quantity) return;
  const same = ing.amounts.find(a => a.unit === p.unit && a.value != null && p.value != null);
  if (same) { same.value += p.value; same.quantity = String(same.value); }
  else ing.amounts.push({ quantity: p.quantity, unit: p.unit, value: p.value });
}

module.exports = { parse, parseLine };

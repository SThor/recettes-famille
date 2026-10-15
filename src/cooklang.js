// Parsing Cooklang : parseur officiel (@cooklang/cooklang, moteur Rust de CookCLI compilé en WASM),
// adapté au format de données du site : { meta, items, ingredients, cookware }.
//   items : { type: 'section', title } | { type: 'note', lines } | { type: 'step', parts }
//   parts : texte, ingrédients (quantité, unité, note, quantité fixe, référence de recette),
//           ustensiles, minuteurs (nommés ou non).
const fs = require('fs');
const YAML = require('yaml');
const wasmGlue = require('@cooklang/cooklang/pkg/cooklang_wasm_bg.js');

// Le paquet est compilé pour les bundlers (import de .wasm) : on instancie le module nous-mêmes,
// de façon synchrone, sans option expérimentale de Node.
const wasm = new WebAssembly.Instance(
  new WebAssembly.Module(fs.readFileSync(require.resolve('@cooklang/cooklang/pkg/cooklang_wasm_bg.wasm'))),
  { './cooklang_wasm_bg.js': wasmGlue },
);
wasmGlue.__wbg_set_wasm(wasm.exports);
if (typeof wasm.exports.__wbindgen_start === 'function') wasm.exports.__wbindgen_start();
const parser = new wasmGlue.Parser();

function splitFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  return { meta: YAML.parse(m[1]) || {}, body: src.slice(m[0].length) };
}

// Valeur d'une quantité officielle → texte affiché et nombre (pour recalculer les portions).
function readValue(v) {
  if (!v) return { text: '', number: null };
  if (v.type === 'text') return { text: String(v.value), number: null };
  if (v.type === 'range') {
    const a = readValue({ type: 'number', value: v.value.start });
    const b = readValue({ type: 'number', value: v.value.end });
    return { text: `${a.text}-${b.text}`, number: null };
  }
  const n = v.value; // { type: 'regular', value } | { type: 'fraction', value: { whole, num, den } }
  if (n.type === 'fraction') {
    const { whole, num, den } = n.value;
    return { text: whole ? `${whole} ${num}/${den}` : `${num}/${den}`, number: whole + num / den };
  }
  return { text: String(n.value), number: Number(n.value) };
}

function readQuantity(q) {
  if (!q) return { quantity: '', unit: '', value: null, fixed: false };
  const { text, number } = readValue(q.value);
  return { quantity: text, unit: q.unit || '', value: number, fixed: q.scalable === false };
}

// Le parseur officiel ne dit pas si un ingrédient est facultatif (@?nom) : on le relève dans le texte.
function optionalNames(body) {
  const names = new Set();
  for (const m of body.matchAll(/@\?([^@#~{}\n(]+?)\{/g)) names.add(m[1].trim().toLowerCase());
  for (const m of body.matchAll(/@\?([\p{L}\p{N}_'’-]+)(?![^\s{]*\{)/gu)) names.add(m[1].trim().toLowerCase());
  return names;
}

// Notes `>` : le parseur officiel fusionne les lignes ; on garde les retours à la ligne de la source.
function noteLines(body) {
  const notes = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      if (!current) notes.push(current = []);
      current.push(line.replace(/^>\s?/, ''));
    } else current = null;
  }
  return notes;
}

function parse(src) {
  src = src.replace(/^﻿/, '');
  const { meta, body } = splitFrontmatter(src); // lève une erreur si l'en-tête YAML est invalide
  const { recipe } = parser.parse(src);
  const optional = optionalNames(body);
  const sourceNotes = noteLines(body.replace(/\[-[\s\S]*?-\]/g, ''));

  const ingredientPart = i => {
    const part = { type: 'ingredient', name: i.name, optional: optional.has(i.name.toLowerCase()), ...readQuantity(i.quantity) };
    if (i.note) part.note = i.note;
    if (i.reference) {
      part.ref = [...i.reference.components.filter(c => c !== '.'), i.reference.name].join('/');
      part.name = i.reference.name;
    }
    return part;
  };

  const items = [];
  for (const section of recipe.sections) {
    if (section.name) items.push({ type: 'section', title: section.name });
    for (const block of section.content) {
      if (block.type === 'text') {
        const lines = sourceNotes.shift();
        items.push({ type: 'note', lines: lines && lines.join(' ') === block.value ? lines : [block.value] });
        continue;
      }
      const parts = block.value.items.map(it => {
        if (it.type === 'text') return { type: 'text', value: it.value };
        if (it.type === 'ingredient') return ingredientPart(recipe.ingredients[it.index]);
        if (it.type === 'cookware') return { type: 'cookware', name: recipe.cookware[it.index].name };
        if (it.type === 'timer') {
          const t = recipe.timers[it.index];
          return { type: 'timer', name: t.name || '', ...readQuantity(t.quantity) };
        }
        if (it.type === 'inlineQuantity') {
          const q = readQuantity(recipe.inline_quantities[it.index]);
          return { type: 'text', value: `${q.quantity}${q.unit ? ' ' + q.unit : ''}` };
        }
        return { type: 'text', value: '' };
      });
      items.push({ type: 'step', parts });
    }
  }

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

// Regroupe les ingrédients du même nom ; additionne si même unité et quantités numériques
// (une quantité fixe ne s'additionne qu'avec une autre quantité fixe).
function addIngredient(list, p) {
  let ing = list.find(i => i.name.toLowerCase() === p.name.toLowerCase() && i.ref === p.ref);
  if (!ing) list.push(ing = { name: p.name, optional: p.optional, ref: p.ref, notes: [], amounts: [] });
  if (p.note && !ing.notes.includes(p.note)) ing.notes.push(p.note);
  if (!p.quantity) return;
  const same = ing.amounts.find(a => a.unit === p.unit && a.fixed === p.fixed && a.value != null && p.value != null);
  if (same) { same.value += p.value; same.quantity = String(same.value); }
  else ing.amounts.push({ quantity: p.quantity, unit: p.unit, value: p.value, fixed: p.fixed });
}

module.exports = { parse };

const fs = require('fs');
const path = require('path');
const { parse } = require('./cooklang');

const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const COURSES = [
  ['apéro', 'Apéro'],
  ['entrée', 'Entrées'],
  ['soupe', 'Soupes'],
  ['plat', 'Plats'],
  ['dessert', 'Desserts'],
];

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function asList(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

// Questions ouvertes : commentaires Cooklang du corps (`-- …` et `[- … -]`), invisibles dans le livre.
function openQuestions(src) {
  const body = src.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const questions = [];
  const rest = body.replace(/\[-([\s\S]*?)-\]/g, (_, q) => { questions.push(q.trim()); return ''; });
  for (const line of rest.split(/\r?\n/)) {
    const m = line.match(/(?:^|\s)--(?!-)\s*(.*)$/);
    if (m && m[1].trim()) questions.push(m[1].trim());
  }
  // Ordre d'apparition : les blocs ont été relevés en premier, on retrie selon leur position.
  return questions.sort((a, b) => body.indexOf(a) - body.indexOf(b));
}

// Construit l'objet recette à partir du source Cooklang (lève une erreur si l'en-tête YAML est invalide).
function fromSource(src, file, dir) {
  const base = file.replace(/\.cook$/, '');
  const r = parse(src);
  if (typeof r.meta !== 'object' || Array.isArray(r.meta)) throw new Error('En-tête YAML invalide');
  const findImage = name => (dir ? PHOTO_EXT.map(e => name + e).find(p => fs.existsSync(path.join(dir, p))) : null);
  const photo = findImage(base);
  // Photos d'étape (convention Cooklang) : « Recette.N.jpg », N = rang de l'étape à partir de 0.
  const stepCount = r.items.filter(i => i.type === 'step').length;
  const stepPhotos = Array.from({ length: stepCount }, (_, n) => findImage(`${base}.${n}`) || null);
  return {
    slug: slugify(base),
    file,
    title: r.meta.title || base,
    course: String(r.meta.course || '').toLowerCase(),
    photo: photo || null,
    originals: asList(r.meta.original),
    tags: asList(r.meta.tags),
    questions: openQuestions(src),
    stepPhotos,
    ...r,
  };
}

// Liens entre recettes, calculés dans les deux sens :
//   `variant of: X`   → « Variante de : X » ici, « Variantes : … » chez X
//   `see also: [X, Y]` → « Voir aussi » des deux côtés
//   `@./X{}`           → « Utilisée dans : … » chez X
// X = nom de fichier (sans .cook) ou titre ; recette introuvable → { title, slug: null } (pas de lien).
function linkRecipes(recipes) {
  const bySlug = new Map();
  for (const r of recipes) {
    bySlug.set(r.slug, r);
    if (!bySlug.has(slugify(r.title))) bySlug.set(slugify(r.title), r);
  }
  const find = name => bySlug.get(slugify(String(name).split('/').pop()));
  const ref = (name, r = find(name)) => (r ? { title: r.title, slug: r.slug } : { title: String(name), slug: null });
  const add = (list, item) => { if (!list.some(x => x.title === item.title && x.slug === item.slug)) list.push(item); };

  for (const r of recipes) r.related = { variantOf: [], variants: [], seeAlso: [], usedIn: [] };
  for (const r of recipes) {
    for (const name of asList(r.meta['variant of'])) {
      const target = find(name);
      add(r.related.variantOf, ref(name, target));
      if (target && target !== r) add(target.related.variants, ref(null, r));
    }
    for (const name of asList(r.meta['see also'])) {
      const target = find(name);
      add(r.related.seeAlso, ref(name, target));
      if (target && target !== r) add(target.related.seeAlso, ref(null, r));
    }
    for (const ing of r.ingredients) {
      const target = ing.ref && find(ing.ref);
      if (target && target !== r) add(target.related.usedIn, ref(null, r));
    }
  }
}

// Valeurs (étiquettes, régimes…) comptées sur toutes les recettes : [{ name, count }], par fréquence
// puis par nom. Les variantes de casse sont regroupées ; on garde la graphie la plus courante
// (en minuscules à égalité).
function countValues(recipes, valuesOf) {
  const groups = new Map();
  for (const r of recipes) {
    for (const raw of new Set(valuesOf(r).map(String))) {
      const value = raw.trim();
      const key = normValue(value);
      if (!key) continue;
      const g = groups.get(key) || { count: 0, spellings: new Map() };
      g.count++;
      g.spellings.set(value, (g.spellings.get(value) || 0) + 1);
      groups.set(key, g);
    }
  }
  return [...groups.values()].map(g => {
    const [name] = [...g.spellings].sort((a, b) => b[1] - a[1] || (a[0] === a[0].toLowerCase() ? -1 : 1))[0];
    return { name, count: g.count };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}
const normValue = s => String(s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

function createStore(dir) {
  let cache = null;
  let cachedAt = 0;

  function load() {
    if (cache && Date.now() - cachedAt < 5000) return cache;
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.cook')) : [];
    const recipes = [];
    for (const file of files) {
      try {
        recipes.push(fromSource(fs.readFileSync(path.join(dir, file), 'utf8'), file, dir));
      } catch (err) {
        console.error(`Recette illisible : ${file}`, err.message);
      }
    }
    recipes.sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
    linkRecipes(recipes);
    cache = recipes;
    cachedAt = Date.now();
    return recipes;
  }

  return {
    dir,
    all: load,
    get: slug => load().find(r => r.slug === slug),
    invalidate() { cache = null; },
    // Toutes les étiquettes (voir countValues).
    tags() { return countValues(load(), r => r.tags); },
    // Régimes (clé `diet`, texte ou liste), comptés comme les étiquettes.
    diets() { return countValues(load(), r => asList(r.meta.diet)); },
    grouped(keep = () => true) {
      const recipes = load().filter(keep);
      const known = COURSES.map(([key, label]) => ({ key, label, recipes: recipes.filter(r => r.course === key) }));
      const others = recipes.filter(r => !COURSES.some(([k]) => k === r.course));
      if (others.length) known.push({ key: 'autre', label: 'Et aussi', recipes: others });
      return known.filter(g => g.recipes.length);
    },
    // Chemin sûr vers une image du dossier de recettes (photo du plat ou fiche d'origine).
    imagePath(rel) {
      const full = path.resolve(dir, rel);
      if (!full.startsWith(path.resolve(dir) + path.sep)) return null;
      // Rien de ce qui est rangé dans Archives/ n'est publié (recettes écartées et leurs images).
      if (path.relative(dir, full).split(path.sep).some(seg => seg.toLowerCase() === 'archives')) return null;
      if (!PHOTO_EXT.includes(path.extname(full).toLowerCase())) return null;
      return fs.existsSync(full) ? full : null;
    },
  };
}

module.exports = { normValue, asList, createStore, fromSource, slugify, PHOTO_EXT, COURSES };

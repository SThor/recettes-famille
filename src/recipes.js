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

function createStore(dir) {
  let cache = null;
  let cachedAt = 0;

  function load() {
    if (cache && Date.now() - cachedAt < 5000) return cache;
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.cook')) : [];
    const recipes = [];
    for (const file of files) {
      try {
        const base = file.slice(0, -5);
        const r = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const photo = PHOTO_EXT.map(e => base + e).find(p => fs.existsSync(path.join(dir, p)));
        recipes.push({
          slug: slugify(base),
          file,
          title: r.meta.title || base,
          course: String(r.meta.course || '').toLowerCase(),
          photo: photo || null,
          originals: asList(r.meta.original),
          tags: asList(r.meta.tags),
          ...r,
        });
      } catch (err) {
        console.error(`Recette illisible : ${file}`, err.message);
      }
    }
    recipes.sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
    cache = recipes;
    cachedAt = Date.now();
    return recipes;
  }

  return {
    all: load,
    get: slug => load().find(r => r.slug === slug),
    grouped() {
      const recipes = load();
      const known = COURSES.map(([key, label]) => ({ key, label, recipes: recipes.filter(r => r.course === key) }));
      const others = recipes.filter(r => !COURSES.some(([k]) => k === r.course));
      if (others.length) known.push({ key: 'autre', label: 'Et aussi', recipes: others });
      return known.filter(g => g.recipes.length);
    },
    // Chemin sûr vers une image du dossier de recettes (photo du plat ou fiche d'origine).
    imagePath(rel) {
      const full = path.resolve(dir, rel);
      if (!full.startsWith(path.resolve(dir) + path.sep)) return null;
      if (!PHOTO_EXT.includes(path.extname(full).toLowerCase())) return null;
      return fs.existsSync(full) ? full : null;
    },
  };
}

module.exports = { createStore, slugify };

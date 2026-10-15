// Syntaxes Cooklang avancées : notes d'ingrédient, quantités fixes, références de recette,
// sections, minuteurs nommés, photos d'étape, métadonnées difficulty / cuisine / diet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../src/cooklang');
const { fromSource } = require('../src/recipes');
const { recipeArticle } = require('../src/views');

const SRC = `---
title: Tarte test
servings: 4
difficulty: facile
cuisine: française
diet: [végétarien, sans porc]
---

== Pâte ==

Étaler la @./Pâte brisée{} dans le #moule{}.

Piquer avec une #fourchette{}.

== Garniture ==

Ajouter les @tomates{2}(pelées) et le @sel{=1%pincée}.

Cuire ~cuisson{45%minutes}.
`;

const steps = r => r.items.filter(i => i.type === 'step');
const ing = (r, name) => r.ingredients.find(i => i.name === name);
const html = () => recipeArticle(fromSource(SRC, 'Tarte test.cook', null), { back: false });

test.describe('Parseur', () => {
  test('note d\'ingrédient : rattachée à l\'ingrédient, retirée du texte', () => {
    const r = parse(SRC);
    const tomates = steps(r)[2].parts.find(p => p.name === 'tomates');
    assert.equal(tomates.note, 'pelées');
    assert.doesNotMatch(JSON.stringify(steps(r)[2].parts.filter(p => p.type === 'text')), /pelées/);
    assert.deepEqual(ing(r, 'tomates').notes, ['pelées']);
  });

  test('quantité fixe : « = » retiré, marquée fixe', () => {
    const sel = ing(parse(SRC), 'sel').amounts[0];
    assert.equal(sel.quantity, '1');
    assert.equal(sel.value, 1);
    assert.equal(sel.fixed, true);
  });

  test('référence de recette : nom propre et chemin', () => {
    const pate = ing(parse(SRC), 'Pâte brisée');
    assert.ok(pate, 'ingrédient nommé « Pâte brisée »');
    assert.equal(pate.ref, 'Pâte brisée');
  });

  test('sections : un élément à part, pas une étape', () => {
    const r = parse(SRC);
    assert.deepEqual(r.items.filter(i => i.type === 'section').map(s => s.title), ['Pâte', 'Garniture']);
    assert.equal(steps(r).length, 4);
    assert.ok(!steps(r).some(s => JSON.stringify(s).includes('==')));
  });

  test('section en syntaxe courte « = Titre »', () => {
    assert.deepEqual(parse('= Sauce\n\nMélanger.').items.map(i => i.type), ['section', 'step']);
  });

  test('minuteur nommé', () => {
    const timer = steps(parse(SRC))[3].parts.find(p => p.type === 'timer');
    assert.equal(timer.name, 'cuisson');
    assert.equal(timer.quantity, '45');
  });
});

test.describe('Affichage', () => {
  test('note visible dans la liste d\'ingrédients', () => {
    assert.match(html(), /tomates <span class="ing-note">\(pelées\)<\/span>/);
  });

  test('quantité fixe : sans « = » et non recalculée', () => {
    const out = html();
    assert.doesNotMatch(out, /=1/);
    assert.match(out, /<span class="qty fixed">1<\/span>&nbsp;pincée/);
  });

  test('référence : lien vers la recette, dans l\'étape et la liste', () => {
    const links = html().match(/<a class="recipe-ref" href="\/recette\/pate-brisee">Pâte brisée<\/a>/g) || [];
    assert.equal(links.length, 2);
  });

  test('sections : intertitres, numérotation qui repart à 1', () => {
    const out = html();
    assert.match(out, /<h3 class="step-section">Pâte<\/h3>/);
    assert.match(out, /<h3 class="step-section">Garniture<\/h3>/);
    const numbers = [...out.matchAll(/class="step-no">(\d+)</g)].map(m => m[1]);
    assert.deepEqual(numbers, ['1', '2', '1', '2']);
  });

  test('minuteur nommé affiché', () => {
    assert.match(html(), /⏲&nbsp;cuisson : 45 minutes/);
  });

  test('temps de repos (clé maison « rest time ») et temps total (« time »)', () => {
    const r = fromSource('---\ntitle: Roulé\nprep time: 20 minutes\ncook time: 25 minutes\nrest time: 3 heures\ntime: 4 heures\n---\n\nRouler.\n', 'Roulé.cook', null);
    const out = recipeArticle(r, { back: false });
    assert.match(out, /<dt>Préparation<\/dt><dd>20 minutes<\/dd>/);
    assert.match(out, /<dt>Cuisson<\/dt><dd>25 minutes<\/dd>/);
    assert.match(out, /<dt>Repos<\/dt><dd>3 heures<\/dd>/);
    assert.match(out, /<dt>Temps total<\/dt><dd>4 heures<\/dd>/);
    // Ordre : préparation, cuisson, repos, total
    const order = ['Préparation', 'Cuisson', 'Repos', 'Temps total'].map(k => out.indexOf(`<dt>${k}</dt>`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  test('difficulté, cuisine, régime parmi les infos', () => {
    const out = html();
    assert.match(out, /<dt>Difficulté<\/dt><dd>facile<\/dd>/);
    assert.match(out, /<dt>Cuisine<\/dt><dd>française<\/dd>/);
    assert.match(out, /<dt>Régime<\/dt><dd>végétarien, sans porc<\/dd>/);
  });
});

// Plages de quantités (« 1 à 2 »), portions sur les deux bornes, minuteurs à plage (borne basse),
// références @& (quantités additionnées, référence introuvable signalée à l'admin).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../src/cooklang');
const { fromSource } = require('../src/recipes');
const { recipeArticle } = require('../src/views');
const { toSeconds } = require('../src/durations');
const Quantites = require('../public/quantites');
const { startApp } = require('./helpers');

const HEAD = '---\ntitle: X\nservings: 4\n---\n\n';
const ing = (src, name) => parse(HEAD + src).ingredients.find(i => i.name === name);
const html = src => recipeArticle(fromSource(HEAD + src, 'x.cook', null));

test.describe('Plages de quantités', () => {
  test('« 1-2 » devient « 1 à 2 », avec les deux bornes', () => {
    assert.deepEqual(ing('Couper la @courgette{1-2}.', 'courgette').amounts, [{ quantity: '1 à 2', unit: '', value: null, range: [1, 2], fixed: false }]);
    assert.deepEqual(ing('Ajouter @sel{1/2-1%c. à café}.', 'sel').amounts, [{ quantity: '1/2 à 1', unit: 'c. à café', value: null, range: [0.5, 1], fixed: false }]);
  });

  test('référence @& : quantités additionnées, plages comprises (exemple de la spec : 100 g + 200-400 g = 300 à 500 g)', () => {
    assert.deepEqual(ing('Mélanger @farine{100%g}.\n\nAjouter @&farine{200-400%g}.', 'farine').amounts,
      [{ quantity: '300 à 500', unit: 'g', value: null, range: [300, 500], fixed: false }]);
    assert.deepEqual(ing('Mélanger @farine{250%g}.\n\nAjouter @&farine{100%g}.', 'farine').amounts,
      [{ quantity: '350', unit: 'g', value: 350, fixed: false }]);
    assert.deepEqual(ing('@lait{1-2%l} puis @&lait{1-2%l}.', 'lait').amounts,
      [{ quantity: '2 à 4', unit: 'l', value: null, range: [2, 4], fixed: false }]);
  });

  test('affichage : liste et étapes portent les deux bornes pour recalculer les portions', () => {
    const page = html('Couper la @courgette{1-2}.');
    assert.match(page, /<span class="amounts"><span class="qty" data-v="1" data-v2="2">1 à 2<\/span><\/span>/);
    assert.match(page, /courgette <span class="amount">\(<span class="qty" data-v="1" data-v2="2">1 à 2<\/span>\)<\/span>/);
  });

  test('quantité fixe en plage : affichée « à », jamais recalculée', () => {
    assert.match(html('Saler @sel{=1-2%pincées}.'), /<span class="qty fixed">1 à 2<\/span>&nbsp;pincées/);
  });
});

test.describe('Portions côté navigateur (public/quantites.js)', () => {
  test('format : fractions courantes en symboles, sinon une décimale avec virgule', () => {
    assert.equal(Quantites.format(0.5), '½');
    assert.equal(Quantites.format(2.25), '2¼');
    assert.equal(Quantites.format(1.3333), '1,3');
    assert.equal(Quantites.format(3), '3');
  });
  test('scaled : une valeur, ou les deux bornes d\'une plage', () => {
    assert.equal(Quantites.scaled({ v: '1' }, 2), '2');
    assert.equal(Quantites.scaled({ v: '1', v2: '2' }, 2), '2 à 4');
    assert.equal(Quantites.scaled({ v: '0.5', v2: '1' }, 0.5), '¼ à ½');
  });
});

test.describe('Minuteurs à plage', () => {
  test('« 10-15 minutes » s\'affiche « 10 à 15 minutes » et le chrono part de la borne basse', () => {
    const page = html('Cuire ~{10-15%minutes}.');
    assert.match(page, /<button type="button" class="timer"[^>]*data-seconds="600"[^>]*>[\s\S]*?<span class="timer-text">10 à 15 minutes<\/span>/);
    assert.equal(toSeconds('10 à 15', 'minutes'), 600);
    assert.equal(toSeconds('10-15', 'minutes'), 600);
  });
});

test.describe('Référence @& introuvable', () => {
  test('parse : signalée dans problems', () => {
    const r = parse(HEAD + 'Ajouter @&beurre{50%g}.');
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /beurre/);
    assert.deepEqual(parse(HEAD + '@beurre{50%g} puis @&beurre{}.').problems, []);
  });

  test('unités de minuteur françaises (heure, secondes) : pas signalées, le site les comprend', () => {
    assert.deepEqual(parse(HEAD + 'Cuire ~{1%heure} puis ~{30%secondes}.').problems, []);
    assert.match(parse(HEAD + 'Cuire ~{1%lunes}.').problems.join(), /lunes/);
  });

  test('aperçu de l\'admin : avertissement lisible', async () => {
    const t = await startApp();
    try {
      const res = await t.admin('/admin/apercu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: HEAD + 'Ajouter @&beurre{50%g}.' }) });
      assert.match(await res.text(), /<p class="warning">[^<]*@&amp;beurre[^<]*<\/p>/);
    } finally { await t.close(); }
  });
});

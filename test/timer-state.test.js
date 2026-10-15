// Mémorisation des minuteurs sur l'appareil (survivent à un rechargement de page).
const test = require('node:test');
const assert = require('node:assert/strict');
const { serialize, restore, storageKey } = require('../public/timer-state');
const { fromSource } = require('../src/recipes');
const { recipeArticle } = require('../src/views');

const NOW = 1_800_000_000_000;
const MIN = 60_000;

test('clé de stockage par page', () => {
  assert.equal(storageKey('/recette/pounty'), 'minuteurs:/recette/pounty');
});

test('un minuteur en cours garde son heure de fin', () => {
  const saved = serialize([{ id: '0', label: 'cuisson', total: 2700, remaining: 2700, endAt: NOW + 10 * MIN, done: false }], NOW);
  const [t] = restore(JSON.parse(JSON.stringify(saved)), NOW + MIN);
  assert.equal(t.endAt, NOW + 10 * MIN);
  assert.equal(t.done, false);
});

test('un minuteur en pause garde son temps restant', () => {
  const [t] = restore(serialize([{ id: '1', label: 'repos', total: 600, remaining: 123.4, endAt: null, done: false }], NOW), NOW + 30 * MIN);
  assert.equal(t.endAt, null);
  assert.equal(t.remaining, 123.4);
});

test('un minuteur arrivé à son terme pendant l\'absence revient « terminé »', () => {
  const [t] = restore(serialize([{ id: '0', label: 'cuisson', total: 60, remaining: 60, endAt: NOW + MIN, done: false }], NOW), NOW + 5 * MIN);
  assert.equal(t.done, true);
  assert.equal(t.endAt, null);
  assert.equal(t.remaining, 0);
});

test('les minuteurs terminés depuis longtemps sont oubliés', () => {
  const saved = serialize([
    { id: '0', label: 'vieux', total: 60, remaining: 60, endAt: NOW + MIN, done: false },
    { id: '1', label: 'récent', total: 60, remaining: 60, endAt: NOW + 3 * 60 * MIN, done: false },
  ], NOW);
  assert.deepEqual(restore(saved, NOW + 3 * 60 * MIN + MIN).map(t => t.label), ['récent']);
});

test('données illisibles → aucun minuteur', () => {
  for (const bad of [null, 'n\'importe quoi', {}, [{ id: 3 }], [{ id: '0', label: 'x', total: 'a' }]]) {
    assert.deepEqual(restore(bad, NOW), []);
  }
});

test('les minuteurs de la page sont numérotés pour les retrouver', () => {
  const html = recipeArticle(fromSource('---\ntitle: T\n---\n\nCuire ~{10%minutes}.\n\nRepos ~repos{1%heure}.\n', 'T.cook', null), { back: false });
  assert.deepEqual([...html.matchAll(/<button type="button" class="timer" data-timer="(\d+)"/g)].map(m => m[1]), ['0', '1']);
});

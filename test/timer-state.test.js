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

// Minuteur à plage (« 10 à 15 minutes ») : rappel doux à la borne basse, alarme à la borne haute.
test.describe('Minuteurs à plage et ajouts de temps', () => {
  const S = 1000;
  const { create, leftOf, phase, dueCheck, ackCheck, snooze, addTime, trayText, progress } = require('../public/timer-state');
  const run = (t, at) => ({ ...t, endAt: at + leftOf(t, at) * S }); // départ à l'instant « at »

  test('create : plage → total = borne haute, rappel à la borne basse ; durée simple → pas de rappel', () => {
    assert.deepEqual(create({ label: 'cuisson', seconds: 600, secondsMax: 900 }),
      { label: 'cuisson', total: 900, check: 600, nextCheck: 300, remaining: 900, endAt: null, done: false });
    assert.deepEqual(create({ label: 'repos', seconds: 600 }),
      { label: 'repos', total: 600, check: null, nextCheck: null, remaining: 600, endAt: null, done: false });
    assert.equal(create({ label: 'x', seconds: 600, secondsMax: 600 }).check, null); // plage vide = durée simple
  });

  test('phases : avant la borne basse, à surveiller entre les deux, terminé', () => {
    const t = run(create({ label: 'c', seconds: 600, secondsMax: 900 }), NOW);
    assert.equal(phase(t, NOW + 599 * S), 'avant');
    assert.equal(phase(t, NOW + 600 * S), 'surveiller');
    assert.equal(phase({ ...t, done: true, endAt: null, remaining: 0 }, NOW + 900 * S), 'termine');
    assert.equal(phase(run(create({ label: 'r', seconds: 600 }), NOW), NOW + 599 * S), 'avant');
  });

  test('rappel doux : dû à la borne basse, une seule fois ; « Encore 2 min » en reprogramme un', () => {
    let t = run(create({ label: 'c', seconds: 600, secondsMax: 900 }), NOW);
    assert.equal(dueCheck(t, NOW + 599 * S), false);
    assert.equal(dueCheck(t, NOW + 600 * S), true);
    t = ackCheck(t);
    assert.equal(dueCheck(t, NOW + 700 * S), false);
    t = snooze(t, NOW + 650 * S); // reste 250 s → prochain rappel quand il restera 130 s
    assert.equal(t.nextCheck, 130);
    assert.equal(dueCheck(t, NOW + 769 * S), false);
    assert.equal(dueCheck(t, NOW + 770 * S), true);
    assert.equal(snooze(t, NOW + 850 * S).nextCheck, null); // moins de 2 min avant la fin : l'alarme suffit
    assert.equal(dueCheck(run(create({ label: 'r', seconds: 60 }), NOW), NOW + 59 * S), false);
  });

  test('+1 min : en cours, en pause, ou terminé (repart pour 1 min)', () => {
    const running = addTime(run(create({ label: 'r', seconds: 600 }), NOW), NOW + 100 * S);
    assert.equal(running.total, 660);
    assert.equal(leftOf(running, NOW + 100 * S), 560);
    const paused = addTime({ ...create({ label: 'r', seconds: 600 }), remaining: 30 }, NOW);
    assert.equal(paused.remaining, 90);
    assert.equal(paused.endAt, null);
    const done = addTime({ ...create({ label: 'r', seconds: 600 }), remaining: 0, done: true, endedAt: NOW }, NOW + 5 * S);
    assert.equal(done.done, false);
    assert.equal(done.endAt, NOW + 65 * S);
  });

  test('texte du bandeau et barre de progression (zone à surveiller)', () => {
    const t = run(create({ label: 'c', seconds: 600, secondsMax: 900 }), NOW);
    assert.equal(trayText(t, NOW + 400 * S), 'Vérifier dans 3:20');
    assert.equal(trayText(t, NOW + 650 * S), 'À surveiller · 4:10');
    assert.equal(trayText({ ...t, endAt: null, remaining: 400 }, NOW), 'Vérifier dans 1:40 ⏸');
    assert.equal(trayText(run(create({ label: 'r', seconds: 90 }), NOW), NOW + 30 * S), '1:00');
    assert.equal(trayText({ ...t, done: true, endAt: null, remaining: 0 }, NOW), 'Terminé !');
    assert.deepEqual(progress(t, NOW + 450 * S), { done: 0.5, watchFrom: 600 / 900 });
    assert.deepEqual(progress(run(create({ label: 'r', seconds: 100 }), NOW), NOW + 25 * S), { done: 0.25, watchFrom: null });
  });

  test('mémorisation : bornes et rappel conservés ; rappel passé pendant l\'absence → pas de sonnerie tardive', () => {
    const t = { ...run(create({ label: 'c', seconds: 600, secondsMax: 900 }), NOW), id: '0' };
    const [back] = restore(JSON.parse(JSON.stringify(serialize([t], NOW))), NOW + 60 * S);
    assert.equal(back.check, 600);
    assert.equal(back.nextCheck, 300);
    const [late] = restore(serialize([t], NOW), NOW + 700 * S);
    assert.equal(late.nextCheck, null);
    assert.equal(phase(late, NOW + 700 * S), 'surveiller');
  });

  test('minuteurs mémorisés avant cette version (sans bornes) : toujours relus', () => {
    const [old] = restore([{ id: '0', label: 'x', total: 60, remaining: 60, endAt: null, done: false }], NOW);
    assert.equal(old.check, null);
    assert.equal(old.nextCheck, null);
  });
});

test.describe('Boutons du bandeau selon l\'état', () => {
  const S = 1000;
  const { create, leftOf, trayActions } = require('../public/timer-state');
  const run = (t, at) => ({ ...t, endAt: at + leftOf(t, at) * S });
  test('« Rappel dans 2 minutes » seulement à surveiller et s\'il reste plus de 2 min ; « +1 min » seulement une fois terminé', () => {
    const range = run(create({ label: 'c', seconds: 600, secondsMax: 900 }), NOW);
    assert.deepEqual(trayActions(range, NOW + 300 * S), []);              // avant la borne basse
    assert.deepEqual(trayActions(range, NOW + 650 * S), ['rappel']);      // à surveiller, reste 250 s
    assert.deepEqual(trayActions(range, NOW + 800 * S), []);              // reste 100 s : l'alarme suffit
    assert.deepEqual(trayActions(run(create({ label: 'r', seconds: 600 }), NOW), NOW + 590 * S), []); // simple, en cours
    assert.deepEqual(trayActions({ ...range, done: true, endAt: null, remaining: 0 }, NOW + 900 * S), ['plus1']);
  });
});

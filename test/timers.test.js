// Minuteurs cliquables : conversion des durées et rendu.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toSeconds } = require('../src/durations');
const { fromSource } = require('../src/recipes');
const { recipeArticle } = require('../src/views');

test.describe('Durées → secondes', () => {
  const cases = [
    ['45', 'minutes', 2700], ['1', 'minute', 60], ['10', 'min', 600], ['5', 'mn', 300],
    ['1', 'heure', 3600], ['3', 'heures', 10800], ['2', 'h', 7200], ['1/2', 'heure', 1800], ['1,5', 'heure', 5400],
    ['30', 'secondes', 30], ['20', 's', 20], ['15', 'sec', 15],
    ['10', 'minutes ', 600], ['10', 'Minutes', 600], ['2', 'hours', 7200], ['90', 'seconds', 90],
  ];
  for (const [q, u, s] of cases) {
    test(`${q} ${u.trim()} → ${s} s`, () => assert.equal(toSeconds(q, u), s));
  }

  test('plage « 25-30 » : on part de la plus courte', () => {
    assert.equal(toSeconds('25-30', 'minutes'), 1500);
  });

  test('unité inconnue ou quantité absente → null', () => {
    assert.equal(toSeconds('2', 'jours de patience'), null);
    assert.equal(toSeconds('', 'minutes'), null);
    assert.equal(toSeconds('quelques', 'minutes'), null);
  });
});

test.describe('Durées écrites en toutes lettres → minutes (en-tête des recettes)', () => {
  const { toMinutes } = require('../src/durations');
  const cases = [
    ['20 minutes', 20], ['45 min', 45], ['1 heure', 60], ['3 heures', 180], ['2 h', 120],
    ['1 h 30', 90], ['1h30', 90], ['2 heures 15', 135], ['1 heure et demie', 90], ['1/2 heure', 30],
    ['25 à 30 minutes', 30], ['10-15 min', 15], ['1 heure (une petite heure)', 60], ['30 secondes', 1], [15, 15],
  ];
  for (const [text, min] of cases) test(`« ${text} » → ${min} min`, () => assert.equal(toMinutes(text), min));

  test('illisible ou vide → null', () => {
    for (const text of ['', null, undefined, 'une nuit', 'quelques instants']) assert.equal(toMinutes(text), null);
  });
});

test.describe('Rendu des minuteurs', () => {
  const html = src => recipeArticle(fromSource(`---\ntitle: T\n---\n\n${src}\n`, 'T.cook', null), { back: false });

  test('minuteur connu : bouton cliquable avec sa durée en secondes et son nom', () => {
    const out = html('Cuire ~cuisson{45%minutes}.');
    assert.match(out, /<button type="button" class="timer" data-timer="0" data-seconds="2700" data-label="cuisson"><svg class="icon icon-timer"[^>]*aria-hidden="true">[\s\S]*?<path class="icon-hand"[\s\S]*?<\/svg><span class="timer-text">cuisson : 45 minutes<\/span><\/button>/);
  });

  test('minuteur sans nom : le libellé est la durée', () => {
    assert.match(html('Attendre ~{10%min}.'), /<button type="button" class="timer" data-timer="0" data-seconds="600" data-label="10 min">/);
  });

  test('durée illisible : simple texte, pas de bouton', () => {
    const out = html('Laisser ~{une nuit%}.');
    assert.doesNotMatch(out, /<button[^>]*class="timer"/);
    assert.match(out, /<span class="timer">/);
  });
});

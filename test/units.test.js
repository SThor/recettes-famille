const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('../src/cooklang');
const { parseTodo, serializeTodo, findItem } = require('../src/todo');
const { setField, yamlList } = require('../src/frontmatter');
const { slugify, fromSource } = require('../src/recipes');

const FIX = path.join(__dirname, 'fixtures', 'recettes');
const read = f => fs.readFileSync(path.join(FIX, f), 'utf8');

test.describe('Cooklang', () => {
  test('lit l\'en-tête YAML', () => {
    const r = parse(read('Pounty.cook'));
    assert.equal(r.meta.title, 'Pounty de ma mamie');
    assert.equal(r.meta.servings, 6);
    assert.deepEqual(r.meta.tags, ['auvergne', 'four']);
  });

  test('ingrédients : quantité, unité, nom multi-mots', () => {
    const { parts } = parse('Mettre la @farine{250%g}, le @lait tiède{1%verre} et @sel.').items[0];
    const ings = parts.filter(p => p.type === 'ingredient');
    assert.deepEqual(ings.map(i => [i.name, i.quantity, i.unit, i.value]), [
      ['farine', '250', 'g', 250],
      ['lait tiède', '1', 'verre', 1],
      ['sel', '', '', null],
    ]);
  });

  test('fractions, ustensiles, minuteurs, facultatif', () => {
    const { parts } = parse('Ajouter la @levure{1/2%paquet} et @?rhum{1%c. à soupe} dans le #saladier{} ~{30%minutes}.').items[0];
    const levure = parts.find(p => p.name === 'levure');
    assert.equal(levure.value, 0.5);
    assert.equal(parts.find(p => p.name === 'rhum').optional, true);
    assert.ok(parts.some(p => p.type === 'cookware' && p.name === 'saladier'));
    assert.ok(parts.some(p => p.type === 'timer' && p.quantity === '30' && p.unit === 'minutes'));
  });

  test('additionne un même ingrédient de même unité', () => {
    const r = parse(read('Galette sèche.cook'));
    const oeufs = r.ingredients.find(i => i.name === 'œufs');
    assert.equal(oeufs.amounts.length, 1);
    assert.equal(oeufs.amounts[0].value, 3);
  });

  test('notes `>` gardées dans l\'ordre, commentaires `--` masqués', () => {
    const r = parse(read('Pounty.cook'));
    assert.equal(r.items[0].type, 'note');
    assert.match(r.items[0].lines[0], /Une belle recette/);
    const text = JSON.stringify(r.items);
    assert.doesNotMatch(text, /point à vérifier/);
    assert.equal(r.items.filter(i => i.type === 'step').length, 3);
  });

  test('accepte les fins de ligne Windows', () => {
    const r = parse(read('Pounty.cook').replace(/\n/g, '\r\n'));
    assert.equal(r.meta.title, 'Pounty de ma mamie');
    assert.equal(r.items.filter(i => i.type === 'step').length, 3);
  });

  test('YAML invalide → erreur', () => {
    assert.throws(() => parse('---\ntitle: [oops\n---\n'));
  });
});

test.describe('À demander', () => {
  test('relecture/réécriture à l\'identique (LF et CRLF)', () => {
    const src = read('À demander.md');
    assert.equal(serializeTodo(parseTodo(src)), src);
    const crlf = src.replace(/\n/g, '\r\n');
    assert.equal(serializeTodo(parseTodo(crlf)), crlf);
  });

  test('sépare titre et commentaire, lit les cases cochées', () => {
    const doc = parseTodo(read('À demander.md'));
    assert.deepEqual(doc.sections.map(s => s.title), ['Entrées', 'Desserts']);
    const salade = findItem(doc, '0.1').item;
    assert.equal(salade.title, 'Salade au cumin');
    assert.equal(salade.note, 'Kenza (femme de [[Lou-Anne]])');
    assert.equal(findItem(doc, '1.0').item.done, true);
  });

  test('conserve les lignes non reconnues', () => {
    const doc = parseTodo(read('À demander.md'));
    doc.sections[1].entries.find(e => e.title === 'Polenta').done = true;
    const out = serializeTodo(doc);
    assert.match(out, /une ligne libre à conserver/);
    assert.match(out, /- \[x\] Polenta/);
  });

  test('findItem refuse une ligne libre', () => {
    assert.equal(findItem(parseTodo(read('À demander.md')), '1.1'), null);
  });
});

test.describe('En-tête', () => {
  test('remplace une clé existante sans toucher au reste', () => {
    const src = read('Pounty.cook');
    const out = setField(src, 'verifie', 'Paul 2026-10-15');
    assert.match(out, /^verifie: Paul 2026-10-15$/m);
    assert.equal(out.replace('verifie: Paul 2026-10-15', 'verifie:'), src);
  });

  test('ajoute une clé absente, vide une clé', () => {
    assert.match(setField('---\ntitle: X\n---\n', 'original', yamlList(['a b.jpg'])), /original: \["a b\.jpg"\]\n---/);
    assert.match(setField('---\nverifie: Paul\n---\n', 'verifie', ''), /^verifie:$/m);
  });

  test('garde les fins de ligne CRLF', () => {
    const out = setField('---\r\ntitle: X\r\nverifie:\r\n---\r\nCorps', 'verifie', 'Paul');
    assert.equal(out, '---\r\ntitle: X\r\nverifie: Paul\r\n---\r\nCorps');
  });
});

test('slugify', () => {
  assert.equal(slugify('Gâteau aux amandes'), 'gateau-aux-amandes');
  assert.equal(slugify('Bœuf bourguignon'), 'boeuf-bourguignon');
  assert.equal(slugify('Pounti de Marie-Lé'), 'pounti-de-marie-le');
});

test.describe('Questions ouvertes (commentaires --)', () => {
  test('relève le texte des commentaires du corps', () => {
    assert.deepEqual(fromSource(read('Pounty.cook'), 'Pounty.cook', null).questions, ['point à vérifier avec Annie']);
  });
  test('ignore les délimiteurs --- et les recettes sans commentaire', () => {
    assert.deepEqual(fromSource(read('Galette sèche.cook'), 'x.cook', null).questions, []);
  });
  test('commentaire en fin de ligne et bloc [- -]', () => {
    const r = fromSource('---\ntitle: T\n---\n\nAjouter @sel{} -- combien ?\n\n[- olives illisibles -]\n', 'x.cook', null);
    assert.deepEqual(r.questions, ['combien ?', 'olives illisibles']);
  });
});

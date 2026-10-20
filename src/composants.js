// Page de test des composants (/composants) : les composants d'interface, rendus par les mêmes
// fonctions que le site, dans chaque thème côte à côte. Sert à valider un changement graphique
// sur une seule page ; chaque partie porte data-part pour n'en capturer que ce qui a changé.
const { fromSource } = require('./recipes');
const { icon } = require('./icons');
const { THEMES, REVIEW_ICON, themeAssets, layout, card, option, filterPill, recipeArticle } = require('./views');

const SAMPLE = `---
title: Pounty de démonstration
author: Annie
servings: 6
prep time: 20 min
cook time: 45 min
diet: Végétarien
tags: [auvergne, four]
---

> Une belle recette de famille.

Préchauffer le #four{} à 180 °C. Mélanger la @farine{250%g}, les @œufs{3} et le @lait{50%cl}.

Enfourner ~{45%minutes}.`;

const cardSample = (title, extra) => fromSource(`---\ntitle: ${title}\nauthor: Annie\nservings: 4\ntime: 30 min\n${extra}---\nMélanger.`, `${title}.cook`, null);

function specimen(theme, label) {
  const recipes = [
    cardSample('Carte à vérifier', ''),
    cardSample('Carte vérifiée', 'checked by: Paul\ndiet: Végétarien\n'),
    fromSource(`---\ntitle: Carte avec questions\nservings: 2\n---\nMélanger. -- une question`, 'q.cook', null),
    cardSample('Quatrième carte', ''),
  ];
  const opts = (kind, items, extra = () => ({})) => items.map(([lbl, count, active], i) => option({ kind, href: '#', label: lbl, count, active, ...extra(i) })).join('');
  const reviews = [['ok', 'Vérifiées'], ['questions', 'Questions'], ['a-verifier', 'À vérifier']];
  const part = (id, title, html) => `<div class="specimen-part" data-part="${id}"><h3 class="specimen-label">${title}</h3>${html}</div>`;
  return `<section class="specimen theme-${theme}">
  <h2 class="specimen-title">${label}</h2>
  ${part('entete', 'En-tête', `<header class="site-header"><a class="brand" href="#">Recettes de la Givellerie</a><a class="header-action" href="#">+ Proposer</a></header>`)}
  ${part('boutons', 'Boutons et champs', `<p class="specimen-row"><a class="button" href="#">Bouton</a> <button type="button" class="link-button">Bouton lien</button> <button type="button" class="sidebar-toggle">${icon('sidebar')} Filtres <span class="count">2</span></button></p>
    <input type="search" id="search" placeholder="Chercher une recette…" aria-label="Chercher">
    <nav class="chips"><a class="chip" href="#">Entrées</a><a class="chip" href="#">Plats</a><a class="chip" href="#">Desserts</a></nav>`)}
  ${part('filtres', 'Panneau de filtres', `<aside class="filters-panel">
    <div class="filters-head"><h2>Filtres</h2><a class="clear-filters" href="#">Tout effacer</a></div>
    <details class="people kind-person" open><summary class="filter-title">${icon('person', 16)} Personnes <span class="count">2</span></summary>
      <div class="tags">${opts('person', [['Annie', 3, false], ['Carole', 5, true]])}</div></details>
    <details class="diets kind-diet" open><summary class="filter-title">${icon('leaf', 16)} Régimes <span class="count">2</span></summary>
      <div class="tags">${opts('diet', [['Végétarien', 4, true], ['Sans gluten', 1, false]])}</div></details>
    <div class="duree kind-duree"><label class="filter-title">${icon('timer', 16)} Durée max <output>30 min</output></label>
      <input type="range" min="0" max="16" step="1" value="6" style="--fill: 38%">
      <div class="duree-presets"><a class="duree-preset" href="#">15 min</a><a class="duree-preset" href="#">30 min</a><a class="duree-preset" href="#">1 h</a></div></div>
    <details class="tag-cloud kind-tag" open><summary class="filter-title">${icon('tag', 16)} Étiquettes <span class="count">2</span></summary>
      <div class="tags">${opts('tag', [['auvergne', 2, true], ['four', 6, false]])}</div></details>
    <details class="review-filter kind-review" open><summary class="filter-title">${icon('check', 16)} Relecture</summary>
      <div class="tags">${opts('review', reviews.map(([k, l], i) => [l, 3 - i, k === 'questions']), i => ({ attrs: ` data-state="${reviews[i][0]}"`, before: icon(REVIEW_ICON[reviews[i][0]], 14) }))}</div></details>
  </aside>`)}
  ${part('pastilles', 'Filtres actifs', `<ul class="active-filters" aria-label="Filtres actifs">
    ${filterPill('person', 'person', 'Personne : <b>Carole</b>', '#')}
    ${filterPill('diet', 'leaf', 'Régime : <b>Végétarien</b>', '#')}
    ${filterPill('duree', 'timer', 'Durée : <b>30 min max</b>', '#')}
    ${filterPill('tag', 'tag', 'Étiquette : <b>auvergne</b>', '#')}
    ${filterPill('review', REVIEW_ICON.questions, 'Relecture : <b>Questions</b>', '#')}
    <li><a class="clear-filters" href="#">Tout effacer</a></li></ul>`)}
  ${part('cartes', 'Cartes', `<section class="course"><h2>Plats</h2><ul class="cards">${recipes.map(r => card(r)).join('')}</ul></section>`)}
  ${part('propositions', 'Propositions (admin)', `<ul class="admin-list">
    <li><a href="#"><b>Gratin aux épinards</b></a> <span class="muted">par Carole, 15/10/2026 · 2 photos</span></li>
    <li><a href="#"><b>Polenta</b></a> <span class="tag-demande">Demande</span> <span class="muted">Desserts · par Paul, 16/10/2026 — Kenza</span></li>
  </ul>`)}
  ${part('recette', 'Recette', recipeArticle(fromSource(SAMPLE, 'demo.cook', null), { back: false, originals: false }))}
</section>`.replace(/href="[^"#][^"]*"/g, 'href="#"');
}

function componentsPage({ account }) {
  const others = Object.keys(THEMES).filter(k => k !== 'simple').map(themeAssets);
  const head = others.map(a => `<link rel="stylesheet" href="${a.fonts}">\n<link rel="stylesheet" href="${a.css}">`).join('\n');
  const body = `<h1>Composants</h1>
<p class="muted">Chaque composant dans chaque thème, pour vérifier un changement de style d'un coup d'œil.</p>
<div class="specimens">${Object.entries(THEMES).map(([k, label]) => specimen(k, label)).join('\n')}</div>`;
  // Thème « simple » sur la page : les autres ne s'appliquent qu'à leur colonne.
  return layout({ title: 'Composants', theme: 'simple', account, body, head, bodyClass: 'page-composants', scripts: false });
}

module.exports = { componentsPage };

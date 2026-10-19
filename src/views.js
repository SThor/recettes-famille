const { slugify, peopleOf, normValue } = require('./recipes');
const { toSecondsRange, formatMinutes } = require('./durations');
const { icon } = require('./icons');
const { REVIEW_STATES, reviewStateOf } = require('./revue');
// Change à chaque démarrage : force le rechargement des CSS/JS après un déploiement.
const ASSET_V = Date.now().toString(36);

const THEMES = {
  simple: 'Simple',
  pastel: 'Pastel douillet',
  vichy: 'Nappe vichy',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = s => encodeURIComponent(s).replace(/%2F/g, '/');

// Feuilles propres à un style (thème + polices hébergées) ; le style « simple » n'en a pas.
const themeAssets = theme => (theme === 'simple' ? { css: '', fonts: '' } : {
  css: `/static/themes/${theme}.css?v=${ASSET_V}`,
  fonts: `/static/fonts/${theme}.css?v=${ASSET_V}`,
});

function layout({ title, theme, body, bodyClass = '', account = null }) {
  const assets = themeAssets(theme);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Recettes de la Givellerie</title>
${assets.fonts ? `<link rel="stylesheet" id="fonts-css" href="${assets.fonts}">` : ''}
<link rel="stylesheet" href="/static/style.css?v=${ASSET_V}">
${assets.css ? `<link rel="stylesheet" id="theme-css" href="${assets.css}">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍲</text></svg>">
</head>
<body class="theme-${theme} ${bodyClass}">
<header class="site-header">
  <a class="brand" href="/">Recettes de la Givellerie</a>
  <a class="header-action" href="/proposer">+ Proposer</a>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  ${account ? `<form method="post" action="/deconnexion" class="account">${account.prenom ? `Connecté·e : <b>${esc(account.prenom)}</b> · ` : ''}<button type="submit" class="link-button">Se déconnecter</button></form>` : ''}
  <p>Style d'essai :
    ${Object.entries(THEMES).map(([k, label]) => {
      const a = themeAssets(k);
      return `<a href="/essais/${k}" data-theme="${k}" data-css="${a.css}" data-fonts="${a.fonts}"${k === theme ? ' aria-current="true"' : ''}>${label}</a>`;
    }).join(' · ')}
  </p>
</footer>
<script src="/static/timer-state.js?v=${ASSET_V}" defer></script>
<script src="/static/quantites.js?v=${ASSET_V}" defer></script>
<script src="/static/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

// Unité des portions : clé maison « servings unit » (bouchons, cookies, parts…), sinon des personnes.
function servingsUnit(meta) {
  const many = String(meta['servings unit'] || '').trim() || 'pers.';
  return { many, one: many === 'pers.' ? many : many.replace(/(?<=\p{L}{2})[sx]$/u, '') };
}

// Ligne d'infos d'une carte : durée totale, portions, régime (seulement ce qui est renseigné).
function cardFacts(r) {
  const servings = Number(r.meta.servings) || null;
  const unit = servingsUnit(r.meta);
  const diets = Array.isArray(r.meta.diet) ? r.meta.diet : r.meta.diet ? [r.meta.diet] : [];
  const facts = [
    r.durations?.total && `${icon('timer', 14)} ${formatMinutes(r.durations.total)}`,
    servings && esc(`${servings} ${servings === 1 ? unit.one : unit.many}`),
    diets.length && `${icon('leaf', 14)} ${esc(diets.join(', '))}`,
  ].filter(Boolean);
  return facts.length ? `<span class="card-facts">${facts.map(f => `<span class="card-fact">${f}</span>`).join('')}</span>` : '';
}

// Icône de relecture d'une carte : ✓ vérifiée sans question, ⚠ questions à résoudre ;
// rien pour une recette simplement pas encore vérifiée (le cas le plus courant : pas de bruit).
const CARD_REVIEW = {
  ok: ['check', 'Vérifiée conforme à l’original'],
  questions: ['alert', 'Questions à résoudre'],
};
// Icône de chaque état dans le panneau de filtres et la pastille.
const REVIEW_ICON = { ok: 'check', questions: 'alert', 'a-verifier': 'circle' };
function cardReview(r) {
  const state = reviewStateOf(r);
  if (!CARD_REVIEW[state]) return '';
  const [name, label] = CARD_REVIEW[state];
  return `<span class="card-review" data-state="${state}" title="${label}" role="img" aria-label="${label}">${icon(name, 16)}</span>`;
}

// « de … » sur une carte : la personne dont c'est la recette, sinon celle qui l'a transmise.
const cardBy = r => asText(r.meta.author || r.meta['shared by'] || '');

function card(r, visible = true) {
  // Recherche libre : titre, ingrédients, étiquettes, personnes (rapporteur + origine) et source.
  const search = [r.title, ...r.ingredients.map(i => i.name), ...r.tags, ...peopleOf(r), r.meta.source && asText(r.meta.source)].filter(Boolean).join(' ').toLowerCase();
  const d = r.durations || {};
  return `<li class="card"${visible ? '' : ' hidden'} data-search="${esc(search)}" data-prep="${d.prep ?? ''}" data-total="${d.total ?? ''}">
  <a href="/recette/${r.slug}">
    ${r.photo ? `<img src="/photos/${enc(r.photo)}" alt="" loading="lazy">` : ''}
    <span class="card-title">${esc(r.title)}${cardReview(r)}</span>
    ${cardBy(r) ? `<span class="card-meta">de ${esc(cardBy(r))}</span>` : ''}
    ${cardFacts(r)}
  </a>
</li>`;
}

// JSON sûr dans un <script> (pas de « </script> » ni de « <!-- » possibles).
const jsonForScript = data => JSON.stringify(data).replace(/</g, '\\u003c');

// Crans du curseur de durée (minutes) ; le dernier cran = sans limite. Partagés avec public/app.js.
const DUREE_STOPS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
const DUREE_PRESETS = [15, 30, 60, 120];
// Icône « barre latérale » (cadre avec une colonne à gauche), couleur du texte du bouton.
const SIDEBAR_ICON = icon('sidebar');

// URL de l'accueil à partir des filtres actuels (dans l'ordre de l'URL), avec des modifications :
// valeur = remplacer/ajouter (une liste = clé répétée, ex. tag), null = retirer.
function homeUrl(params, changes = {}) {
  const entries = params.filter(([k]) => !(k in changes));
  for (const [k, v] of Object.entries(changes)) if (v != null) for (const x of [].concat(v)) entries.push([k, String(x)]);
  // Garder l'ordre d'origine pour les clés modifiées qui existaient déjà.
  const order = params.map(([k]) => k);
  entries.sort((a, b) => (order.includes(a[0]) ? order.indexOf(a[0]) : 99) - (order.includes(b[0]) ? order.indexOf(b[0]) : 99));
  return entries.length ? `/?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '/';
}

function home({ account, relecture = '', reviews = [], groups, fits = () => true, theme, selectedTags = [], tagInfo = () => null, regime = '', personne = '', duree = null, temps = 'total', unknown = 0, params = [], tags = [], diets = [], people = [] }) {
  const count = groups.reduce((n, g) => n + g.recipes.filter(fits).length, 0);
  const recettes = n => `${n} recette${n > 1 ? 's' : ''}`;
  // Étiquettes choisies (plusieurs possibles) : lien avec une autre sélection d'étiquettes.
  const isSelected = name => selectedTags.some(x => normValue(x) === normValue(name));
  const withTags = list => homeUrl(params, { tag: list.length ? list : null });
  const withoutTag = name => withTags(selectedTags.filter(x => normValue(x) !== normValue(name)));
  // Option d'un filtre du panneau (personne, régime, étiquette, relecture) : un seul composant, classe
  // « option » + son type. Active → marquée (aria-current) ; href = où mène le clic (la choisir ou la retirer).
  const option = ({ kind, href, active, label, count, title = '', attrs = '', before = '' }) =>
    `<a class="option ${kind}"${attrs} href="${esc(href)}"${active ? ' aria-current="true"' : ''}${title ? ` title="${esc(title)}"` : ''}>${before}${esc(label)} <span class="count">${count}</span></a>`;
  // Filtre à une seule valeur (personne, régime, relecture) : choisir remplace, rechoisir retire.
  const single = (kind, key, value, label, count, active, extra = {}) =>
    option({ kind, label, count, active, href: homeUrl(params, { [key]: active ? null : value }), ...extra });

  // Filtres actifs en pastilles : une croix par filtre (retire ce filtre seulement),
  // « Tout effacer » au bout de la rangée s'il y en a plusieurs.
  const active = [
    regime && ['leaf', `Régime : <b>${esc(regime)}</b>`, { regime: null }],
    personne && ['person', `Personne : <b>${esc(personne)}</b>`, { personne: null }],
    relecture && [REVIEW_ICON[relecture], `Relecture : <b>${esc((REVIEW_STATES.find(([k]) => k === relecture) || [])[1])}</b>`, { relecture: null }],
    ...selectedTags.map(tg => ['tag', `Étiquette : <b>${esc(tg)}</b>`, { tag: selectedTags.filter(x => x !== tg).length ? selectedTags.filter(x => x !== tg) : null }]),
    duree && ['timer', `Durée : <b>${formatMinutes(duree)} max</b> (${temps === 'prep' ? 'préparation' : 'temps total'})`, { duree: null, temps: null }],
  ].filter(Boolean);
  const pills = active.length ? `<ul class="active-filters" aria-label="Filtres actifs">${active.map(([iconName, label, remove]) =>
    `<li class="filter-pill"><span class="pill-label">${icon(iconName, 16)} ${label}</span><a class="pill-remove" href="${esc(homeUrl(params, remove))}" aria-label="Retirer ce filtre">×</a></li>`).join('')}${active.length > 1 ? '<li><a class="clear-filters" href="/">Tout effacer</a></li>' : ''}</ul>` : '';
  const notes = `${duree && unknown ? `<p class="muted small">${unknown === 1 ? '1 recette' : `${unknown} recettes`} sans durée${temps === 'prep' ? ' de préparation' : ''} ${unknown === 1 ? 'n’est pas comptée' : 'ne sont pas comptées'}.</p>` : ''}
  ${active.length && !count ? `<p class="empty">${selectedTags.length === 1 && !regime && !duree ? 'Aucune recette avec cette étiquette.' : 'Aucune recette pour ce filtre.'}</p>` : ''}`;
  // En-tête de la colonne des résultats : nombre de recettes et bouton pour replier le panneau (grand écran).
  // Ligne d'outils au-dessus des deux colonnes : bouton pour replier / déplier le panneau (à gauche,
  // il ne bouge pas quand le panneau se replie) et nombre de recettes.
  const resultsHead = `<div class="results-head"><button type="button" class="sidebar-toggle" aria-controls="filtres" aria-expanded="true" title="Masquer les filtres">${SIDEBAR_ICON} Filtres${active.length ? ` <span class="count">${active.length}</span>` : ''}</button><p class="results-count"><b>${count}</b> recette${count > 1 ? 's' : ''}</p></div>`;

  // Les trois filtres du panneau ont le même titre (.filter-title : icône, libellé, compteur) ;
  // régimes et étiquettes sont dépliables, ouverts d'office quand un de leurs filtres est actif.
  const peopleRow = people.length ? `<details class="people"${personne ? ' open' : ''}>
    <summary class="filter-title">${icon('person', 16)} Personnes <span class="count">${people.length}</span></summary>
    <div class="tags">${people.map(p => single('person', 'personne', p.name, p.name, p.count, normValue(p.name) === normValue(personne))).join('')}</div>
  </details>` : '';
  const dietRow = diets.length ? `<details class="diets"${regime ? ' open' : ''}>
    <summary class="filter-title">${icon('leaf', 16)} Régimes <span class="count">${diets.length}</span></summary>
    <div class="tags">${diets.map(d => single('diet', 'regime', d.name, d.name, d.count, normValue(d.name) === normValue(regime))).join('')}</div>
  </details>` : '';
  // Relecture : vérifiées / questions à résoudre / pas encore vérifiées (mêmes icônes que les cartes).
  const reviewRow = reviews.length ? `<details class="review-filter"${relecture ? ' open' : ''}>
    <summary class="filter-title">${icon('check', 16)} Relecture</summary>
    <div class="tags">${reviews.map(x => single('review', 'relecture', x.key, x.label, x.count, x.key === relecture, { attrs: ` data-state="${x.key}"`, before: icon(REVIEW_ICON[x.key], 14) })).join('')}</div>
  </details>` : '';
  // Une étiquette s'ajoute aux étiquettes déjà choisies ; une étiquette choisie se retire au clic.
  const tagCloud = tags.length ? `<details class="tag-cloud"${selectedTags.length ? ' open' : ''}>
    <summary class="filter-title">${icon('tag', 16)} Étiquettes <span class="count">${tags.length}</span></summary>
    <div class="tags">${tags.map(x => option({
      kind: 'tag', label: x.name, count: x.count, active: isSelected(x.name), title: tagInfo(x.name)?.definition,
      href: isSelected(x.name) ? withoutTag(x.name) : withTags([...selectedTags, x.name]),
    })).join('')}</div>
    <p class="glossary-link"><a href="/etiquettes">Toutes les étiquettes et leur définition</a></p>
  </details>` : '';

  // Curseur : position = premier cran ≥ durée demandée ; sans durée = dernier cran (sans limite).
  const found = duree ? DUREE_STOPS.findIndex(s => s >= duree) : -1;
  const stopIndex = found === -1 ? DUREE_STOPS.length : found;
  const dureeBlock = `<div class="duree">
    <label class="filter-title" for="duree-range">${icon('timer', 16)} Durée max <output id="duree-label">${duree ? formatMinutes(duree) : 'sans limite'}</output></label>
    <input type="range" id="duree-range" min="0" max="${DUREE_STOPS.length}" step="1" value="${stopIndex}" data-stops="${DUREE_STOPS.join(',')}" style="--fill: ${Math.round(stopIndex / DUREE_STOPS.length * 100)}%">
    <div class="duree-presets">${DUREE_PRESETS.map(m => `<a class="duree-preset" data-minutes="${m}" href="${esc(homeUrl(params, { duree: m }))}">${formatMinutes(m)}</a>`).join('')}</div>
    <label class="duree-prep"><input type="checkbox" id="duree-prep" ${temps === 'prep' ? 'checked' : ''}> Préparation seulement</label>
  </div>`;

  const body = `
<section class="intro">
  <h1>Le livre de recettes de la famille Givel</h1>
  <p>Les recettes de Maman, de Grand-Maman et de la Givellerie étendue.</p>
</section>
<button type="button" class="filters-toggle" aria-controls="filtres" aria-expanded="false">Filtres${active.length ? ` <span class="count">${active.length}</span>` : ''}</button>
${resultsHead}
<div class="home-layout">
<aside class="filters-panel" id="filtres" aria-label="Filtres">
  <div class="filters-head"><h2>Filtres</h2>${active.length > 1 ? '<a class="clear-filters" href="/">Tout effacer</a>' : ''}</div>
  ${peopleRow}
  ${dietRow}
  ${dureeBlock}
  ${tagCloud}
  ${reviewRow}
  <button type="button" class="button filters-apply">Voir <span id="filters-count">${recettes(count)}</span></button>
</aside>
<div class="home-results">
  <div class="search-box">
    <input type="search" id="search" placeholder="Chercher une recette, un ingrédient, une personne…" aria-label="Chercher" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="tag-suggestions" aria-expanded="false">
    <ul id="tag-suggestions" role="listbox" aria-label="Étiquettes suggérées" hidden></ul>
  </div>
  <script type="application/json" id="tags-data">${jsonForScript(tags)}</script>
  <template id="tag-icon">${icon('tag', 14)}</template>
  <nav class="chips">
    ${groups.map(g => `<a class="chip" href="#${g.key}">${esc(g.label)}</a>`).join('')}
  </nav>
  ${pills}
  ${notes}
  ${groups.map(g => `
  <section class="course" id="${g.key}"${g.recipes.some(fits) ? '' : ' hidden'}>
    <h2>${esc(g.label)}</h2>
    <ul class="cards">${g.recipes.map(r => card(r, fits(r))).join('')}</ul>
  </section>`).join('')}
  <p class="empty" id="no-result" hidden>Aucune recette ne correspond… <a href="/proposer">En proposer une ?</a></p>
</div>
</div>`;
  return layout({ title: 'Accueil', theme, account, body, bodyClass: 'page-home' });
}

// Quantité affichée ; data-v (et data-v2, borne haute d'une plage) permettent de la recalculer
// selon les portions (public/quantites.js), sauf quantité fixe « = ».
function fmtAmount(a) {
  const qty = a.fixed
    ? `<span class="qty fixed">${esc(a.quantity)}</span>`
    : a.range ? `<span class="qty" data-v="${a.range[0]}" data-v2="${a.range[1]}">${esc(a.quantity)}</span>`
    : a.value != null ? `<span class="qty" data-v="${a.value}">${esc(a.quantity)}</span>` : esc(a.quantity);
  return `${qty}${a.unit ? `&nbsp;${esc(a.unit)}` : ''}`;
}

// Nom d'ingrédient ; une référence (@./Pâte brisée{}) devient un lien vers cette recette.
function ingName(i) {
  if (!i.ref) return esc(i.name);
  return `<a class="recipe-ref" href="/recette/${slugify(i.ref.split('/').pop())}">${esc(i.name)}</a>`;
}

// ctx.timer : compteur des minuteurs de la recette (data-timer), pour les retrouver après un rechargement.
function stepHtml(parts, ctx = { timer: 0 }) {
  return parts.map(p => {
    if (p.type === 'text') return esc(p.value);
    if (p.type === 'ingredient') {
      const amount = p.quantity ? ` <span class="amount">(${fmtAmount(p)})</span>` : '';
      return `<span class="ing">${ingName(p)}${amount}</span>`;
    }
    if (p.type === 'cookware') return `<span class="tool">${esc(p.name)}</span>`;
    const duration = `${p.quantity}${p.unit ? ' ' + p.unit : ''}`;
    const label = `${icon('timer', 16)}<span class="timer-text">${p.name ? `${esc(p.name)} : ` : ''}${esc(duration)}</span>`;
    // Durée lisible : bouton qui lance un compte à rebours (public/app.js), sinon simple texte.
    // Plage « 10 à 15 minutes » : rappel doux à la borne basse, alarme à la borne haute (data-seconds-max).
    const [seconds, secondsMax] = toSecondsRange(p.quantity, p.unit) || [];
    return seconds
      ? `<button type="button" class="timer" data-timer="${ctx.timer++}" data-seconds="${seconds}"${secondsMax > seconds ? ` data-seconds-max="${secondsMax}"` : ''} data-label="${esc(p.name || duration)}">${label}</button>`
      : `<span class="timer">${label}</span>`;
  }).join('');
}

// Liens vers les recettes liées (variante de, variantes, voir aussi, utilisée dans).
function relatedHtml(related) {
  if (!related) return '';
  const link = x => (x.slug ? `<a href="/recette/${x.slug}">${esc(x.title)}</a>` : `<span>${esc(x.title)}</span>`);
  const rows = [
    ['Variante de', related.variantOf],
    ['Variantes', related.variants],
    ['Voir aussi', related.seeAlso],
    ['Utilisée dans', related.usedIn],
  ].filter(([, list]) => list.length);
  if (!rows.length) return '';
  return `<nav class="related" aria-label="Recettes liées">${rows.map(([label, list]) => `<p>${label} : ${list.map(link).join(', ')}</p>`).join('')}</nav>`;
}

const asText = v => (Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? v.name || '' : String(v));

// tagInfo(nom) → { definition, family } du glossaire (info-bulle des étiquettes), ou null.
function recipeArticle(r, { back = true, originals = true, tagInfo = () => null } = {}) {
  const m = r.meta;
  const servings = Number(m.servings) || null;
  // Clé maison « servings unit » (bouchons, cookies, parts…) ; sinon des personnes.
  const unit = servingsUnit(m);
  const facts = [
    m['prep time'] && ['Préparation', m['prep time']],
    m['cook time'] && ['Cuisson', m['cook time']],
    m['rest time'] && ['Repos', m['rest time']], // clé maison : temps de repos (frigo, pousse…)
    m.time && ['Temps total', m.time],
    m.difficulty && ['Difficulté', m.difficulty],
    m.cuisine && ['Cuisine', m.cuisine],
    m.diet && ['Régime', m.diet],
    m.author && ['Recette de', m.author], // personne(s) dont c'est la recette (clé standard)
    m.source && ['Source', m.source],
    m['shared by'] && ['Transmise par', m['shared by']], // clé maison : qui l'a transmise, si différent
  ].filter(Boolean).map(([k, v]) => {
    // Régimes et personnes mènent à l'accueil filtré sur cette valeur.
    const param = { 'Régime': 'regime', 'Recette de': 'personne', 'Transmise par': 'personne' }[k];
    return [k, param
      ? (Array.isArray(v) ? v : [v]).map(d => `<a href="/?${param}=${encodeURIComponent(d)}">${esc(d)}</a>`).join(', ')
      : esc(asText(v))];
  });

  // Numérotation des étapes : repart à 1 à chaque section ; photos d'étape indexées sur toute la recette.
  let stepNo = 0;
  const ctx = { timer: 0 };
  let stepIndex = -1;
  const itemHtml = it => {
    if (it.type === 'section') { stepNo = 0; return `<h3 class="step-section">${esc(it.title)}</h3>`; }
    if (it.type === 'note') return `<blockquote class="note">${it.lines.map(esc).join('<br>')}</blockquote>`;
    const photo = r.stepPhotos?.[++stepIndex];
    return `<div class="step"><span class="step-no">${++stepNo}</span><div><p>${stepHtml(it.parts, ctx)}</p>${photo ? `<img class="step-photo" src="/photos/${enc(photo)}" alt="" loading="lazy">` : ''}</div></div>`;
  };

  return `
<article class="recipe" ${servings ? `data-servings="${servings}"` : ''}>
  ${back ? `<a class="back" href="/#${esc(r.course || '')}">← Toutes les recettes</a>` : ''}
  ${r.photo ? `<img class="hero" src="/photos/${enc(r.photo)}" alt="${esc(r.title)}">` : ''}
  <h1>${esc(r.title)}</h1>
  ${m.description ? `<p class="description">${esc(m.description)}</p>` : ''}
  ${r.tags.length ? `<p class="tags">${icon('tag', 16)}${r.tags.map(t => `<a class="tag" href="/etiquette/${encodeURIComponent(t)}"${tagInfo(t)?.definition ? ` title="${esc(tagInfo(t).definition)}"` : ''}>${esc(t)}</a>`).join('')}</p>` : ''}
  ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
  ${relatedHtml(r.related)}

  <section class="ingredients">
    <div class="section-head">
      <h2>Ingrédients</h2>
      ${servings ? `<div class="servings">
        <button type="button" data-step="-1" aria-label="Moins de portions">−</button>
        <span><b id="servings-count">${servings}</b> <span id="servings-unit" data-one="${esc(unit.one)}" data-many="${esc(unit.many)}">${esc(servings === 1 ? unit.one : unit.many)}</span></span>
        <button type="button" data-step="1" aria-label="Plus de portions">+</button>
      </div>` : ''}
    </div>
    <ul>
      ${r.ingredients.map(i => `<li><label><input type="checkbox">
        <span>${ingName(i)}${i.notes?.length ? ` <span class="ing-note">(${i.notes.map(esc).join(', ')})</span>` : ''}${i.optional ? ' <em>(facultatif)</em>' : ''}</span>
        <span class="amounts">${i.amounts.map(a => fmtAmount(a)).join(' + ')}</span>
      </label></li>`).join('')}
    </ul>
    ${r.cookware.length ? `<p class="cookware"><strong>Ustensiles :</strong> ${r.cookware.map(esc).join(', ')}</p>` : ''}
  </section>

  <section class="steps">
    <h2>Préparation</h2>
    ${r.items.map(itemHtml).join('\n')}
  </section>

  ${originals && r.originals.length ? `<details class="originals">
    <summary>Voir la fiche d'origine</summary>
    ${r.originals.map(o => `<a href="/photos/${enc(o)}"><img src="/photos/${enc(o)}" alt="Fiche d'origine" loading="lazy"></a>`).join('')}
  </details>` : ''}
</article>`;
}

// Messages après une action de relecture (?merci=…).
const MERCI = {
  reponse: 'Merci, ta réponse est enregistrée.',
  erreur: 'Merci, l’erreur est signalée : elle sera corrigée.',
  conforme: 'C’est noté : la recette est marquée conforme à l’original.',
  'non-conforme': 'C’est noté : la recette n’est plus marquée conforme.',
};

// Relecture ouverte à la famille : questions (commentaires --) avec réponse, case « Conforme »,
// signalement d'erreur. Le prénom est demandé dans le formulaire s'il n'est pas encore connu.
function reviewHtml(r, { account, merci, error }) {
  const action = what => `/recette/${r.slug}/${what}`;
  const nameField = account?.prenom ? '' : '<label>Ton prénom<input name="prenom" required maxlength="40" autocomplete="given-name"></label>';
  const verified = r.meta['checked by'] ? String(r.meta['checked by']) : '';
  const blocked = !verified && r.threads.length > 0;
  const authors = peopleOf(r);

  const threads = r.threads.length ? `<h3>Questions en suspens</h3>
    <ul class="threads">${r.threads.map((th, i) => `<li class="thread">
      <p class="question">${esc(th.question)}</p>
      ${th.answers.length ? `<ul class="answers">${th.answers.map(a => `<li>${a.who ? `<b>${esc(a.who)}</b> : ` : ''}${esc(a.text)}</li>`).join('')}</ul>` : ''}
      <details class="reply"><summary>${th.answers.length ? 'Ajouter une réponse' : 'Répondre'}</summary>
        <form method="post" action="${action('repondre')}">
          <input type="hidden" name="index" value="${i}"><input type="hidden" name="question" value="${esc(th.question)}">
          ${nameField}
          <label>Ta réponse<textarea name="reponse" rows="3" required maxlength="2000"></textarea></label>
          <button type="submit" class="button">Envoyer la réponse</button>
        </form>
      </details>
    </li>`).join('')}</ul>` : '';

  // Sans prénom connu : pas d'envoi automatique, il faut d'abord le saisir.
  const auto = account?.prenom && !blocked ? ' onchange="this.form.submit()"' : '';
  const conforme = `<form method="post" action="${action('conforme')}" class="conforme">
    <label class="check"><input type="checkbox" name="conforme" value="1"${verified ? ' checked' : ''}${blocked ? ' disabled' : ''}${auto}>
      <span>Conforme à l’original${verified ? ` <span class="muted small">(${esc(verified)})</span>` : ''}</span></label>
    <p class="muted small">${blocked
      ? 'Il reste des questions : on pourra cocher quand elles seront réglées.'
      : `Relue face à la fiche d’origine (ou à ton souvenir) : quantités, étapes, rien ne manque.${authors.length ? ` Idéalement cochée par ${esc(authors.join(' ou '))}.` : ''}`}</p>
    ${blocked ? '' : `${nameField}${auto ? '<noscript><button type="submit" class="button">Enregistrer</button></noscript>' : '<button type="submit" class="button">Enregistrer</button>'}`}
  </form>`;

  const report = `<details class="report"><summary>Il y a une erreur ?</summary>
    <form method="post" action="${action('erreur')}">
      ${nameField}
      <label>Qu’est-ce qui ne va pas ?<textarea name="texte" rows="3" required maxlength="2000"></textarea></label>
      <button type="submit" class="button">Signaler l’erreur</button>
    </form>
  </details>`;

  return `<section class="side-panel revue" id="revue">
  <h2>Relecture</h2>
  ${MERCI[merci] ? `<p class="flash">${MERCI[merci]}</p>` : ''}
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  ${threads}
  ${conforme}
  ${report}
</section>`;
}

// État de la relecture, visible même panneau replié : ✓ si vérifiée sans question, ⚠ sinon.
function reviewStatus(r) {
  const n = r.threads.length; // ✓ ssi reviewStateOf(r) === 'ok'
  const problems = [n && `${n} question${n > 1 ? 's' : ''} en suspens`, !r.meta['checked by'] && 'pas encore vérifiée conforme'].filter(Boolean);
  return problems.length
    ? { status: 'warn', icon: icon('alert', 20), label: problems.join(' · ') }
    : { status: 'ok', icon: icon('check', 20), label: `tout est bon (vérifiée : ${asText(r.meta['checked by'])})` };
}

// Bouton d'une colonne latérale : même icône que le panneau de filtres (en miroir à droite).
const sideToggle = (id, iconName, label, extra = '') =>
  `<button type="button" class="side-toggle" aria-controls="${id}" aria-expanded="false"${extra}>${icon(iconName)}<span class="side-label">${label}</span>`;

// Page recette en trois colonnes, repliées par défaut : fiche d'origine | recette | relecture.
// La relecture s'ouvre d'elle-même après une action (message de confirmation ou erreur).
function recipe({ r, theme, account = null, merci = '', error = '', tagInfo }) {
  const st = reviewStatus(r);
  const reviewOpen = Boolean(MERCI[merci] || error);
  const left = r.originals.length
    ? `<div class="side side-left" data-open="false">
    ${sideToggle('cote-original', 'sidebar', 'Fiche d’origine', ' title="Fiche d’origine"')}</button>
    <section class="side-panel originals-panel" id="cote-original">
      <h2>Fiche d’origine</h2>
      ${r.originals.map(o => `<a href="/photos/${enc(o)}" target="_blank"><img src="/photos/${enc(o)}" alt="Fiche d’origine" loading="lazy"></a>`).join('')}
    </section>
  </div>`
    : '<div class="side side-left side-empty"></div>';
  const right = `<div class="side side-right" data-open="${reviewOpen}">
    ${sideToggle('revue', 'sidebarRight', 'Relecture', ` title="Relecture : ${esc(st.label)}" data-status="${st.status}"`).replace('aria-expanded="false"', `aria-expanded="${reviewOpen}"`)}<span class="side-status">${st.icon}</span></button>
    ${reviewHtml(r, { account, merci, error })}
  </div>`;
  const body = `<div class="recipe-layout">
  ${left}
  <div class="recipe-center">${recipeArticle(r, { originals: false, tagInfo })}</div>
  ${right}
</div>`;
  return layout({ title: r.title, theme, account, body, bodyClass: 'page-recipe' });
}

function proposeForm({ theme, account, error, values = {} }) {
  const body = `
<section class="form-page">
  <h1>Proposer une recette</h1>
  <p>Écris-la comme tu veux, même en vrac, ou prends simplement la fiche en photo. Paul s'occupe de la mettre au propre.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/proposer" enctype="multipart/form-data">
    <label>Ton prénom<input name="prenom" required maxlength="80" value="${esc(values.prenom)}" autocomplete="given-name"></label>
    <label>Nom de la recette<input name="titre" required maxlength="150" value="${esc(values.titre)}"></label>
    <label>La recette <small>(ingrédients, étapes… comme ça vient)</small>
      <textarea name="texte" rows="10" maxlength="20000">${esc(values.texte)}</textarea></label>
    <label>Photos <small>(la fiche, le plat… facultatif)</small>
      <input type="file" name="photos" accept="image/*" multiple></label>
    <label>Une anecdote, un souvenir ? <small>(facultatif)</small>
      <textarea name="anecdote" rows="3" maxlength="5000">${esc(values.anecdote)}</textarea></label>
    <button type="submit" class="button">Envoyer la recette</button>
  </form>
</section>`;
  return layout({ title: 'Proposer une recette', theme, account, body });
}

function thanks({ theme, account, prenom }) {
  const body = `<section class="form-page center">
  <h1>Merci ${esc(prenom)} !</h1>
  <p>Ta recette est bien arrivée. Elle apparaîtra dans le livre une fois mise au propre.</p>
  <p><a class="button" href="/">Retour aux recettes</a> <a href="/proposer">En proposer une autre</a></p>
</section>`;
  return layout({ title: 'Merci', theme, account, body });
}

function login({ theme, error, prenom = '' }) {
  const body = `<section class="form-page center">
  <h1>Recettes de la Givellerie</h1>
  <p>Ce petit livre est réservé à la famille Givel.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/connexion" class="login">
    <label>Ton prénom <small>(il signe tes réponses et vérifications)</small><input name="prenom" required maxlength="40" value="${esc(prenom)}" autocomplete="given-name"></label>
    <label>Mot de passe de la famille<input type="password" name="motdepasse" required autocomplete="current-password"></label>
    <button type="submit" class="button">Entrer</button>
  </form>
</section>`;
  return layout({ title: 'Connexion', theme, body });
}

function essais({ theme, account }) {
  const body = `<section class="form-page">
  <h1>Styles d'essai</h1>
  <p>Choisis un style : il s'applique à tout le site, sur cet appareil.</p>
  <ul class="theme-list">
    <li><a href="/essais/simple"><b>Simple</b><span>Minimal, sans fioritures.</span></a></li>
    <li><a href="/essais/pastel"><b>Pastel douillet</b><span>Vert sauge, rose poudré, beige crème.</span></a></li>
    <li><a href="/essais/vichy"><b>Nappe vichy</b><span>Rustique, carreaux rouges et papier kraft.</span></a></li>
  </ul>
</section>`;
  return layout({ title: 'Styles', theme, account, body });
}


const nbRecettes = n => (n ? `${n} recette${n > 1 ? 's' : ''}` : 'aucune recette');
const tagHref = name => `/etiquette/${encodeURIComponent(name)}`;

// Page « Étiquettes » : le glossaire (Recettes/Étiquettes.md) par famille, avec définitions et nombre
// de recettes, puis les étiquettes utilisées mais pas encore définies.
// families : [{ family, tags: [{ name, definition, count }] }] (null sans glossaire) ; missing : [{ name, count }]
function glossaryPage({ theme, account, families, missing }) {
  const item = (x, definition) => `<li><a class="tag" href="${tagHref(x.name)}">${esc(x.name)}</a> <span class="count">${nbRecettes(x.count)}</span>${definition ? `<p class="definition">${esc(definition)}</p>` : ''}</li>`;
  const body = `<section class="glossary">
  <a class="back" href="/">← Toutes les recettes</a>
  <h1>Étiquettes</h1>
  <p class="muted">Chaque étiquette regroupe des recettes : clique dessus pour les voir.</p>
  ${families ? families.map(f => `<h2>${esc(f.family)}</h2>
  <ul class="glossary-list">${f.tags.map(x => item(x, x.definition)).join('')}</ul>`).join('\n') : '<p class="muted">Le glossaire (Étiquettes.md) n’existe pas encore.</p>'}
  ${missing.length ? `<h2>Sans définition</h2>
  <ul class="glossary-list">${missing.map(x => item(x)).join('')}</ul>` : ''}
</section>`;
  return layout({ title: 'Étiquettes', theme, account, body, bodyClass: 'page-glossary' });
}

// Page d'une étiquette : sa définition et ses recettes, comme un filtre figé (sans panneau de filtres) ;
// un lien mène à l'accueil filtré pour la combiner avec d'autres filtres.
function tagPage({ theme, account, name, info, groups }) {
  const count = groups.reduce((n, g) => n + g.recipes.length, 0);
  const body = `<section class="tag-page">
  <a class="back" href="/etiquettes">← Toutes les étiquettes</a>
  <h1>${icon('tag', 24)} ${esc(name)}</h1>
  ${info?.family ? `<p class="family">${esc(info.family)}</p>` : ''}
  ${info?.definition ? `<p class="definition">${esc(info.definition)}</p>` : '<p class="muted">Pas encore de définition dans le glossaire.</p>'}
  <p class="tag-actions muted"><b>${nbRecettes(count)}</b>${count ? ` · <a href="/?tag=${encodeURIComponent(name)}">Combiner avec d’autres filtres</a>` : ''}</p>
  ${count ? groups.map(g => `<section class="course">
    <h2>${esc(g.label)}</h2>
    <ul class="cards">${g.recipes.map(r => card(r)).join('')}</ul>
  </section>`).join('') : '<p class="empty">Aucune recette pour l’instant.</p>'}
</section>`;
  return layout({ title: name, theme, account, body, bodyClass: 'page-tag' });
}

function notFound({ theme, account }) {
  return layout({ title: 'Introuvable', theme, account, body: `<section class="form-page center"><h1>Recette introuvable</h1><p><a href="/">Retour aux recettes</a></p></section>` });
}

module.exports = { THEMES, ASSET_V, esc, enc, layout, recipeArticle, home, recipe, glossaryPage, tagPage, proposeForm, thanks, login, essais, notFound };

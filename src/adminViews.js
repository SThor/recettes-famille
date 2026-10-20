const { esc, enc, layout, ASSET_V } = require('./views');
const { cookTimeHint, COURSES } = require('./recipes');

const yes = ok => `<span class="badge ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span>`;

// États d'une recette pour les filtres du suivi. « terminee » = tout est renseigné, photo du plat,
// conforme à l'original et aucune question en suspens ; sinon « a-finir » + ce qui manque.
function recipeFlags(r) {
  const m = r.meta;
  const flags = [];
  if (r.questions.length) flags.push('questions');
  else if (!m['checked by']) flags.push('a-verifier');
  if (!(m.author || m['shared by']) || !m.source || !m.servings) flags.push('infos');
  if (!r.photo) flags.push('photo');
  return flags.length || !m['checked by'] ? ['a-finir', ...flags] : ['terminee'];
}

const FILTERS = [
  ['toutes', 'Toutes'],
  ['a-finir', 'À finir'],
  ['questions', 'Questions'],
  ['a-verifier', 'À vérifier'],
  ['infos', 'Infos manquantes'],
  ['photo', 'Sans photo'],
  ['terminee', 'Terminées'],
];
const wikiText = s => esc(s).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);

function dashboard({ theme, user, recipes, missingTags = [], proposals, imported = [], history, flash }) {
  const n = recipes.length;
  const count = f => recipes.filter(f).length;
  const stats = [
    ['vérifiées', count(r => r.meta['checked by'])],
    ['portions', count(r => r.meta.servings)],
    ['photos du plat', count(r => r.photo)],
    ['auteur', count(r => r.meta.author || r.meta['shared by'])],
  ];
  const tabs = [
    ['propositions', 'Propositions', proposals.length],
    ['recettes', 'Recettes', n],
    ['historique', 'Historique', null],
  ];
  // Volet ouvert par défaut (sans #ancre) : les propositions s'il y en a à traiter.
  const defaultTab = proposals.length ? 'propositions' : 'recettes';
  const panel = (id, inner) => `<section class="tab-panel" id="${id}" role="tabpanel" aria-labelledby="tab-${id}">${inner}</section>`;

  const body = `
<div class="admin dashboard" data-default-tab="${defaultTab}">
  <div class="admin-head">
    <h1>Suivi du livre</h1>
    <p class="muted small">Connecté en tant que <b>${esc(user)}</b></p>
  </div>
  <nav class="admin-tabs" role="tablist" aria-label="Volets du suivi">
    ${tabs.map(([id, label, count]) => `<a role="tab" id="tab-${id}" href="#${id}" aria-controls="${id}">${label}${count === null ? '' : ` <span class="count">${count}</span>`}</a>`).join('')}
  </nav>
  ${flash ? `<p class="flash">${esc(flash)}</p>` : ''}

  ${panel('propositions', `<h2>Propositions à traiter</h2>
  ${proposals.length ? `<ul class="admin-list">${proposals.map(p => p.type === 'demande' ? `<li>
    <a href="/admin/propositions/${enc(p.id)}"><b>${esc(p.titre)}</b></a>
    <span class="tag-demande">Demande</span>
    <span class="muted">${p.categorie ? `${esc(p.categorie)} · ` : ''}par ${esc(p.prenom)}, ${esc(p.date)}${p.note ? ` — ${wikiText(p.note)}` : ''}</span>
  </li>` : `<li>
    <a href="/admin/propositions/${enc(p.id)}"><b>${esc(p.titre)}</b></a>
    <span class="muted">par ${esc(p.prenom)}, ${esc(p.date)}${p.photos.length ? ` · ${p.photos.length} photo${p.photos.length > 1 ? 's' : ''}` : ''}</span>
  </li>`).join('')}</ul>` : '<p class="muted">Rien en attente.</p>'}
  <details class="todo-add"><summary>+ Nouvelle demande</summary>
    <p class="muted small">Une recette à réclamer à la famille : tu pourras en rédiger la fiche ici dès que tu l’as.</p>
    <form method="post" action="/admin/demandes">
      <label>Recette<input name="titre" required maxlength="200"></label>
      <label>Catégorie <small>(facultatif)</small><input name="categorie" list="categories" maxlength="60"></label>
      <datalist id="categories">${COURSES.map(([, label]) => `<option value="${esc(label)}">`).join('')}</datalist>
      <label>À qui la demander, commentaire <small>(facultatif)</small><input name="note" maxlength="300"></label>
      <button class="button">Ajouter la demande</button>
    </form>
  </details>
  ${imported.length ? `<h3>Importées dans le vault <span class="count">${imported.length}</span></h3>
  <p class="muted small">Récupérées avec deploy/recuperer-propositions.sh, à mettre au propre par l’agent du vault.</p>
  <ul class="admin-list">${imported.map(p => `<li><span><b>${esc(p.titre)}</b> <span class="muted">par ${esc(p.prenom)}, ${esc(p.date)}</span></span></li>`).join('')}</ul>` : ''}`)}

  ${panel('recettes', `<div class="panel-head"><h2>Recettes</h2><a class="button button-small" href="/admin/recettes/nouvelle">+ Nouvelle recette</a></div>
  <p class="stats"><b>${n} recettes</b> · ${stats.map(([k, v]) => `${k} : ${v}/${n}`).join(' · ')}</p>
  <div class="filters" role="group" aria-label="Filtrer les recettes">
    ${FILTERS.map(([id, label]) => `<button type="button" class="filter" data-filter="${id}" aria-pressed="${id === 'toutes'}">${label} <span class="count">${id === 'toutes' ? n : recipes.filter(r => recipeFlags(r).includes(id)).length}</span></button>`).join('')}
  </div>
  ${missingTags.length ? `<div class="glossary-missing">
    <p><b>⚠ Étiquettes absentes du glossaire</b> <span class="muted small">(à définir dans Recettes/Étiquettes.md, voir <a href="/etiquettes">la page Étiquettes</a>)</span></p>
    <ul>${missingTags.map(x => `<li><b>${esc(x.name)}</b> : ${x.recipes.map(r => `<a href="/admin/recettes/${r.slug}">${esc(r.title)}</a>`).join(', ')}</li>`).join('')}</ul>
  </div>` : ''}
  <p class="muted filter-empty" hidden>Aucune recette pour ce filtre.</p>
  <ul class="admin-list recipes-status">
  ${recipes.map(r => `<li data-flags="${recipeFlags(r).join(' ')}">
    <div class="row">
      <a href="/admin/recettes/${r.slug}"><b>${esc(r.title)}</b></a>
      <a class="muted small" href="/recette/${r.slug}">voir</a>
    </div>
    <div class="row badges">
      <span class="muted small">${esc(r.course || '—')}</span>
      <span>Auteur ${yes(r.meta.author || r.meta['shared by'])}</span>
      <span>Source ${yes(r.meta.source)}</span>
      <span>Portions ${yes(r.meta.servings)}</span>
      <span>Photo ${yes(r.photo)}</span>
      ${cookTimeHint(r) ? `<span class="hint">${esc(cookTimeHint(r))}</span>` : ''}
    </div>
    <form method="post" action="/admin/recettes/${r.slug}/verifie" class="verify">
      <label title="Relue et conforme à la recette d’origine, sans question en suspens"><input type="checkbox" name="verifie" ${r.meta['checked by'] ? 'checked' : ''} onchange="this.form.submit()">
        Conforme à l’original${r.meta['checked by'] ? ` <span class="muted small">(${esc(r.meta['checked by'])})</span>` : ''}</label>
      ${r.questions.length ? `<span class="questions" title="${esc(r.questions.join(' · '))}">⚠ ${r.questions.length} question${r.questions.length > 1 ? 's' : ''} en suspens</span>` : ''}
      <noscript><button>OK</button></noscript>
    </form>
  </li>`).join('')}
  </ul>`)}

  ${panel('historique', `<h2>Historique</h2>
  ${history ? `<ul class="history">${history.map(h => `<li><span class="muted small">${esc(h.date)} · ${esc(h.author)}</span><br>${esc(h.subject)}</li>`).join('')}</ul>` : '<p class="muted">Pas de dépôt git.</p>'}`)}
</div>
<script src="/static/admin.js?v=${ASSET_V}" defer></script>`;
  return layout({ title: 'Suivi', theme, body, bodyClass: 'page-admin page-dashboard' });
}

const COOK_HELP = `<details class="help"><summary>Aide Cooklang</summary>
<ul>
  <li><code>@farine{250%g}</code> ingrédient (quantité%unité) · <code>@sel{}</code> sans quantité · <code>@?rhum{2%c. à soupe}</code> facultatif</li>
  <li><code>#four{}</code> ustensile · <code>~{30%minutes}</code> minuteur</li>
  <li>Ligne vide = nouvelle étape · <code>&gt; texte</code> note ou anecdote · <code>-- texte</code> commentaire invisible</li>
</ul></details>`;

// Éditeur en trois volets : original (fiche d'origine / proposition), formulaire, aperçu.
// Ordre du DOM = ordre de lecture sur mobile ; les colonnes se forment selon la largeur (CSS).
function editor({ theme, title, action, source, base, fichier, isNew, proposal, error, current, photo, originals = [], preview = '', verified = '', questions = [] }) {
  const hasOriginal = originals.length > 0 || Boolean(proposal);
  const body = `
<section class="admin editor">
  <a class="back" href="${proposal ? '/admin#propositions' : '/admin#recettes'}">← Suivi</a>
  <h1>${esc(title)}</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <div class="editor-layout${hasOriginal ? ' has-original' : ''}">
    ${hasOriginal ? `<aside class="pane-original">
      <details open id="original-box">
        <summary>${proposal ? (proposal.type === 'demande' ? 'Demande' : 'Proposition') : 'Fiche d’origine'}${originals.length > 1 ? ` (${originals.length} photos)` : ''}</summary>
        ${proposal ? proposalBlock(proposal) : ''}
        ${originals.map(src => `<a href="${src}" target="_blank" title="Ouvrir en grand"><img src="${src}" alt="Fiche d'origine" loading="lazy"></a>`).join('')}
      </details>
    </aside>` : ''}
    <div class="pane-form">
      <form method="post" action="${action}" enctype="multipart/form-data" id="editor-form">
        ${base ? `<input type="hidden" name="base" value="${esc(base)}">` : ''}
        ${isNew ? `<label>Nom du fichier <small>(sans .cook)</small><input name="fichier" required value="${esc(fichier)}"></label>` : `<p class="muted small">Fichier : ${esc(fichier)}</p>`}
        ${proposal && proposal.photos.length ? `<fieldset class="roles"><legend>Que faire des photos ?</legend>
          ${proposal.photos.map(p => `<div class="role">
            <img src="/admin/fichiers/${enc(proposal.id)}/${enc(p)}" alt="">
            <select name="role:${esc(p)}">
              <option value="original">Fiche d'origine</option>
              <option value="plat">Photo du plat</option>
              <option value="ignorer">Ignorer</option>
            </select></div>`).join('')}
        </fieldset>` : ''}
        <label>Recette (Cooklang)<textarea name="source" rows="22" spellcheck="false" class="code">${esc(source)}</textarea></label>
        ${COOK_HELP}
        ${!proposal ? `<label>Photo du plat ${photo ? `<small>(remplace l'actuelle)</small>` : '<small>(facultatif)</small>'}<input type="file" name="photo_plat" accept="image/*"></label>
          ${photo ? `<img class="thumb" src="/photos/${enc(photo)}" alt="">` : ''}` : ''}
        <div class="verify-box">
          <label><input type="checkbox" name="verifie" ${verified ? 'checked' : ''}>
            <span>Conforme à l’original${verified ? ` <span class="muted small">(${esc(verified)})</span>` : ''}</span></label>
          <p class="muted small">À cocher une fois la recette relue face à l’original. Laisser décochée tant qu’il reste des questions (commentaires <code>--</code>).</p>
          ${questions.length ? `<div class="questions">⚠ ${questions.length} question${questions.length > 1 ? 's' : ''} en suspens :<ul>${questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="editor-actions">
          <button type="button" class="button secondary" id="preview-btn">Aperçu</button>
          <button class="button">${proposal ? 'Publier la recette' : 'Enregistrer'}</button>
        </div>
      </form>
      ${proposal ? `<form method="post" action="/admin/propositions/${enc(proposal.id)}/archiver" onsubmit="return confirm('Archiver cette proposition sans la publier ? (elle reste conservée sur le serveur)')">
        <button class="link-button">Archiver sans publier</button></form>` : ''}
      ${current ? `<details class="current"><summary>Version actuelle du fichier</summary><pre class="code">${esc(current)}</pre></details>` : ''}
    </div>
    <div class="pane-preview">
      <p class="pane-title">Aperçu <span class="muted small" id="apercu-etat"></span></p>
      <div id="apercu" class="apercu">${preview}</div>
    </div>
  </div>
</section>
<script src="/static/admin.js?v=${ASSET_V}" defer></script>`;
  return layout({ title, theme, body, bodyClass: 'page-admin page-editor' });
}

function proposalBlock(p) {
  if (p.type === 'demande') return `<div class="proposal">
    <p class="muted small">Demandée par <b>${esc(p.prenom)}</b> le ${esc(p.date)}${p.categorie ? ` · ${esc(p.categorie)}` : ''}</p>
    ${p.note ? `<p>${wikiText(p.note)}</p>` : ''}
    <p class="muted small">Demande sans texte : rédige la fiche à droite.</p>
  </div>`;
  return `<div class="proposal">
    <p class="muted small">Proposée par <b>${esc(p.prenom)}</b> le ${esc(p.date)}</p>
    <pre>${esc(p.texte || '(pas de texte)')}</pre>
    ${p.anecdote ? `<blockquote class="note">${esc(p.anecdote)}</blockquote>` : ''}
  </div>`;
}

module.exports = { dashboard, editor };

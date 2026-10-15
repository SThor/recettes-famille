const { esc, enc, layout, ASSET_V } = require('./views');

const yes = ok => `<span class="badge ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span>`;
const wikiText = s => esc(s).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);

function dashboard({ theme, user, recipes, proposals, todo, history, flash }) {
  const n = recipes.length;
  const count = f => recipes.filter(f).length;
  const stats = [
    ['vérifiées', count(r => r.meta.verifie)],
    ['portions', count(r => r.meta.servings)],
    ['photos du plat', count(r => r.photo)],
    ['auteur', count(r => r.meta.author)],
  ];
  const todoItems = todo ? todo.sections.flatMap(s => s.entries.filter(e => e.type === 'item')) : [];
  const tabs = [
    ['propositions', 'Propositions', proposals.length],
    ['recettes', 'Recettes', n],
    ['a-demander', 'À demander', todoItems.filter(i => !i.done).length],
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
  ${proposals.length ? `<ul class="admin-list">${proposals.map(p => `<li>
    <a href="/admin/propositions/${enc(p.id)}"><b>${esc(p.titre)}</b></a>
    <span class="muted">par ${esc(p.prenom)}, ${esc(p.date)}${p.photos.length ? ` · ${p.photos.length} photo${p.photos.length > 1 ? 's' : ''}` : ''}</span>
  </li>`).join('')}</ul>` : '<p class="muted">Rien en attente.</p>'}`)}

  ${panel('recettes', `<div class="panel-head"><h2>Recettes</h2><a class="button button-small" href="/admin/recettes/nouvelle">+ Nouvelle recette</a></div>
  <p class="stats"><b>${n} recettes</b> · ${stats.map(([k, v]) => `${k} : ${v}/${n}`).join(' · ')}</p>
  <ul class="admin-list recipes-status">
  ${recipes.map(r => `<li>
    <div class="row">
      <a href="/admin/recettes/${r.slug}"><b>${esc(r.title)}</b></a>
      <a class="muted small" href="/recette/${r.slug}">voir</a>
    </div>
    <div class="row badges">
      <span class="muted small">${esc(r.course || '—')}</span>
      <span>Auteur ${yes(r.meta.author)}</span>
      <span>Source ${yes(r.meta.source)}</span>
      <span>Portions ${yes(r.meta.servings)}</span>
      <span>Photo ${yes(r.photo)}</span>
    </div>
    <form method="post" action="/admin/recettes/${r.slug}/verifie" class="verify">
      <label><input type="checkbox" name="verifie" ${r.meta.verifie ? 'checked' : ''} onchange="this.form.submit()">
        Vérifiée${r.meta.verifie ? ` <span class="muted small">(${esc(r.meta.verifie)})</span>` : ''}</label>
      <noscript><button>OK</button></noscript>
    </form>
  </li>`).join('')}
  </ul>`)}

  ${panel('a-demander', `<h2>À demander</h2>
  ${todo ? todo.sections.map(s => `
    <h3>${esc(s.title)}</h3>
    <ul class="admin-list todo">
    ${s.entries.filter(e => e.type === 'item').map(e => `<li class="${e.done ? 'done' : ''}">
      <form method="post" action="/admin/a-demander/coche">
        <input type="hidden" name="id" value="${e.id}"><input type="hidden" name="titre" value="${esc(e.title)}">
        <label><input type="checkbox" name="fait" ${e.done ? 'checked' : ''} onchange="this.form.submit()">
          <span>${wikiText(e.title)}${e.note ? ` <span class="muted small">— ${wikiText(e.note)}</span>` : ''}</span></label>
      </form>
      <form method="post" action="/admin/a-demander/suppr" onsubmit="return confirm('Retirer « ${esc(e.title.replace(/['\\]/g, '’'))} » de la liste ?')">
        <input type="hidden" name="id" value="${e.id}"><input type="hidden" name="titre" value="${esc(e.title)}">
        <button class="icon" aria-label="Retirer">✕</button>
      </form>
    </li>`).join('')}
    </ul>`).join('') : '<p class="muted">Fichier « À demander.md » introuvable.</p>'}
  ${todo ? `<form method="post" action="/admin/a-demander/ajout" class="todo-add">
    <h3>Ajouter</h3>
    <label>Catégorie<select name="section">${todo.sections.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join('')}</select></label>
    <label>Recette<input name="titre" required maxlength="200"></label>
    <label>Commentaire <small>(facultatif)</small><input name="note" maxlength="300"></label>
    <button class="button">Ajouter à la liste</button>
  </form>` : ''}`)}

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
function editor({ theme, title, action, source, base, fichier, isNew, proposal, error, current, photo, originals = [], preview = '', verified = '' }) {
  const hasOriginal = originals.length > 0 || Boolean(proposal);
  const body = `
<section class="admin editor">
  <a class="back" href="${proposal ? '/admin#propositions' : '/admin#recettes'}">← Suivi</a>
  <h1>${esc(title)}</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <div class="editor-layout${hasOriginal ? ' has-original' : ''}">
    ${hasOriginal ? `<aside class="pane-original">
      <details open id="original-box">
        <summary>${proposal ? 'Proposition' : 'Fiche d’origine'}${originals.length > 1 ? ` (${originals.length} photos)` : ''}</summary>
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
        <label class="verify-box"><input type="checkbox" name="verifie" ${verified ? 'checked' : ''}>
          <span>Vérifiée par rapport à l'original${verified ? ` <span class="muted small">(${esc(verified)})</span>` : ''}</span></label>
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
  return `<div class="proposal">
    <p class="muted small">Proposée par <b>${esc(p.prenom)}</b> le ${esc(p.date)}</p>
    <pre>${esc(p.texte || '(pas de texte)')}</pre>
    ${p.anecdote ? `<blockquote class="note">${esc(p.anecdote)}</blockquote>` : ''}
  </div>`;
}

module.exports = { dashboard, editor };

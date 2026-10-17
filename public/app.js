// Accueil : recherche par mot + durée max (curseur), appliquées ensemble aux cartes.
// Les filtres régime / étiquette sont faits par le serveur (liens) ; la durée est prévisualisée
// en direct ici, puis validée dans l'URL (au relâchement du curseur sur grand écran,
// avec « Voir N recettes » dans le tiroir sur mobile).
(() => {
  const cards = [...document.querySelectorAll('.home-results .card')];
  if (!cards.length && !document.getElementById('filtres')) return;
  const search = document.getElementById('search');
  const panel = document.getElementById('filtres');
  const range = document.getElementById('duree-range');
  const label = document.getElementById('duree-label');
  const prep = document.getElementById('duree-prep');
  const countEl = document.getElementById('filters-count');
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stops = range ? range.dataset.stops.split(',').map(Number) : [];
  const fmt = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`);
  // Durée affichée par le serveur (peut ne pas tomber sur un cran, ex. ?duree=35) : gardée tant qu'on ne touche pas au curseur.
  const params = new URLSearchParams(location.search);
  let maxDuree = Number(params.get('duree')) || null;

  function apply() {
    const q = search ? norm(search.value.trim()) : '';
    const field = prep?.checked ? 'prep' : 'total';
    let shown = 0;
    document.querySelectorAll('.home-results .course').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.card').forEach(card => {
        const minutes = card.dataset[field] === '' ? null : Number(card.dataset[field]);
        const okDuree = !maxDuree || (minutes != null && minutes <= maxDuree);
        const okSearch = !q || norm(card.dataset.search).includes(q);
        card.hidden = !(okDuree && okSearch);
        if (!card.hidden) visible++;
      });
      section.hidden = visible === 0;
      shown += visible;
    });
    const none = document.getElementById('no-result');
    if (none) none.hidden = shown > 0 || !q;
    if (countEl) countEl.textContent = `${shown} recette${shown > 1 ? 's' : ''}`;
    const head = document.querySelector('.results-count');
    if (head) head.innerHTML = `<b>${shown}</b> recette${shown > 1 ? 's' : ''}`;
  }

  search?.addEventListener('input', apply);
  if (!panel || !range) return;

  // URL correspondant à l'état du curseur et de la case (les autres filtres sont conservés).
  function targetUrl() {
    const p = new URLSearchParams(location.search);
    if (maxDuree) p.set('duree', maxDuree); else p.delete('duree');
    if (maxDuree && prep.checked) p.set('temps', 'prep'); else p.delete('temps');
    const qs = p.toString().replace(/\+/g, '%20');
    return `/${qs ? `?${qs}` : ''}`;
  }
  const commit = () => { const url = targetUrl(); if (url !== location.pathname + location.search) location.href = url; };
  const desktop = window.matchMedia('(min-width: 1000px)');

  range.addEventListener('input', () => {
    const i = Number(range.value);
    maxDuree = i >= stops.length ? null : stops[i];
    label.textContent = maxDuree ? fmt(maxDuree) : 'sans limite';
    range.style.setProperty('--fill', `${Math.round(i / stops.length * 100)}%`);
    apply();
  });
  range.addEventListener('change', () => { if (desktop.matches) commit(); });
  prep.addEventListener('change', () => { apply(); if (desktop.matches && maxDuree) commit(); });

  // Tiroir des filtres (mobile)
  document.documentElement.classList.add('js-filters');
  const toggle = document.querySelector('.filters-toggle');
  const setOpen = on => {
    document.body.classList.toggle('filters-open', on);
    toggle.setAttribute('aria-expanded', String(on));
  };
  toggle.addEventListener('click', e => { e.stopPropagation(); setOpen(!document.body.classList.contains('filters-open')); });
  panel.querySelector('.filters-apply').addEventListener('click', () => {
    const url = targetUrl();
    if (url !== location.pathname + location.search) location.href = url; else setOpen(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', e => {
    if (document.body.classList.contains('filters-open') && !panel.contains(e.target)) setOpen(false);
  });
})();

// Portions : recalcule les quantités
const recipe = document.querySelector('.recipe[data-servings]');
if (recipe) {
  const base = Number(recipe.dataset.servings);
  let current = base;
  const count = document.getElementById('servings-count');
  recipe.querySelectorAll('.servings button').forEach(btn => btn.addEventListener('click', () => {
    current = Math.max(1, current + Number(btn.dataset.step));
    count.textContent = current;
    const unit = document.getElementById('servings-unit');
    if (unit) unit.textContent = current === 1 ? unit.dataset.one : unit.dataset.many;
    recipe.querySelectorAll('.qty[data-v]').forEach(el => { el.textContent = Quantites.scaled(el.dataset, current / base); });
  }));
}

// Minuteurs : un clic lance le compte à rebours, un autre le met en pause ; un bandeau en bas
// d'écran liste les minuteurs en cours ; à la fin, sonnerie + vibration jusqu'à l'arrêt.
(() => {
  const buttons = [...document.querySelectorAll('button.timer[data-seconds]')];
  if (!buttons.length) return;

  const timers = new Map(); // bouton → { label, html, total, remaining, endAt, done, ringing }
  const tray = document.createElement('div');
  tray.className = 'timer-tray';
  tray.hidden = true;
  tray.setAttribute('aria-live', 'polite');
  document.body.append(tray);
  let audio = null;
  let wakeLock = null;
  let tick = null;
  const baseTitle = document.title;
  const RING_FOR = 60_000; // la sonnerie dure au plus 1 min
  const storeKey = window.TimerState?.storageKey(location.pathname);

  // Mémorise les minuteurs sur l'appareil : ils survivent à un rechargement (changement de page…).
  function save() {
    if (!storeKey) return;
    try {
      const list = [...timers].map(([btn, t]) => ({ ...t, id: btn.dataset.timer }));
      if (list.length) localStorage.setItem(storeKey, JSON.stringify(TimerState.serialize(list, Date.now())));
      else localStorage.removeItem(storeKey);
    } catch { /* stockage indisponible (navigation privée…) : tant pis */ }
  }

  const { clock } = TimerState;

  // Son généré (pas de fichier audio) ; le contexte doit naître d'un clic de l'utilisateur.
  function unlockAudio() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
  }
  function beep() {
    if (!audio) return;
    const now = audio.currentTime;
    [0, 0.25, 0.5].forEach(offset => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  }
  // Rappel doux (borne basse d'une plage) : deux notes montantes, une seule fois, plus discrètes.
  function chime() {
    if (!audio) return;
    const now = audio.currentTime;
    [[0, 660], [0.18, 880]].forEach(([offset, freq]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.52);
    });
  }
  function softAlert(t) {
    chime();
    navigator.vibrate?.(200);
    Object.assign(t, TimerState.ackCheck(t));
    save();
  }

  // Garder l'écran allumé tant qu'un minuteur tourne (si le navigateur le permet).
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && [...timers.values()].some(t => t.endAt)) keepAwake(true);
  });

  function ring(t, endedAt = Date.now()) {
    t.done = true;
    t.endAt = null;
    t.remaining = 0;
    t.endedAt = endedAt;
    t.nextCheck = null;
    save();
    if (Date.now() - endedAt >= RING_FOR) return; // terminé depuis longtemps : juste affiché
    const once = () => { beep(); navigator.vibrate?.([300, 150, 300]); };
    once();
    t.ringing = setInterval(() => { if (Date.now() - endedAt >= RING_FOR) stopRinging(t); else once(); }, 1500);
    document.title = `⏰ ${t.label} — terminé !`;
  }
  function stopRinging(t) {
    clearInterval(t.ringing);
    t.ringing = null;
    if (![...timers.values()].some(x => x.ringing)) document.title = baseTitle;
  }

  function toggle(btn) {
    unlockAudio();
    let t = timers.get(btn);
    if (!t) {
      // Plage « 10 à 15 minutes » : data-seconds = borne basse (rappel doux), data-seconds-max = borne haute.
      t = { ...TimerState.create({ label: btn.dataset.label, seconds: Number(btn.dataset.seconds), secondsMax: Number(btn.dataset.secondsMax) || 0 }), html: btn.innerHTML, ringing: null };
      timers.set(btn, t);
    }
    if (t.done) return stop(btn); // minuteur terminé : un clic l'arrête
    if (t.endAt) { t.remaining = (t.endAt - Date.now()) / 1000; t.endAt = null; } // pause
    else t.endAt = Date.now() + t.remaining * 1000; // départ ou reprise
    save();
    update();
  }
  function stop(btn) {
    const t = timers.get(btn);
    if (!t) return;
    stopRinging(t);
    btn.innerHTML = t.html;
    btn.classList.remove('running', 'paused', 'done');
    timers.delete(btn);
    save();
    update();
  }
  // « Encore 2 min » (nouveau rappel doux) et « +1 min » (prolonge ; un minuteur terminé repart).
  function snooze(btn) {
    const t = timers.get(btn);
    Object.assign(t, TimerState.snooze(t, Date.now()));
    save();
    update();
  }
  function addMinute(btn) {
    const t = timers.get(btn);
    stopRinging(t);
    Object.assign(t, TimerState.addTime(t, Date.now()));
    save();
    update();
  }

  function update() {
    const now = Date.now();
    for (const [btn, t] of timers) {
      if (t.endAt && t.endAt <= now) ring(t);
      else if (TimerState.dueCheck(t, now)) softAlert(t);
      const left = TimerState.leftOf(t, now);
      btn.classList.toggle('running', Boolean(t.endAt));
      btn.classList.toggle('paused', !t.endAt && !t.done);
      btn.classList.toggle('done', t.done);
      btn.classList.toggle('watch', TimerState.phase(t, now) === 'surveiller');
      // Seul le texte change : l'icône garde son animation (aiguille qui tourne, pause, fin).
      const text = btn.querySelector('.timer-text');
      if (text) text.textContent = t.done ? 'Terminé !' : clock(left);
      btn.title = t.done ? 'Arrêter' : t.endAt ? 'Mettre en pause' : 'Reprendre';
    }
    renderTray(now);
    const running = [...timers.values()].some(t => t.endAt);
    if (running && !tick) tick = setInterval(update, 250);
    if (!running && tick) { clearInterval(tick); tick = null; }
    keepAwake(running);
  }

  function renderTray(now) {
    tray.hidden = timers.size === 0;
    const button = (className, text, onclick, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = text;
      if (title) b.title = title;
      b.onclick = onclick;
      return b;
    };
    tray.replaceChildren(...[...timers].map(([btn, t]) => {
      const watch = TimerState.phase(t, now) === 'surveiller';
      const actions = TimerState.trayActions(t, now);
      const row = document.createElement('div');
      row.className = `timer-row${t.done ? ' done' : ''}${watch ? ' watch' : ''}`;
      // Ligne 1 : nom (va à l'étape), temps (pause / reprise), +1 min une fois terminé, arrêt.
      const line = document.createElement('div');
      line.className = 'timer-line';
      const close = button('timer-stop', '✕', () => stop(btn));
      close.setAttribute('aria-label', `Arrêter le minuteur ${t.label}`);
      line.append(
        button('timer-name', t.label, () => btn.scrollIntoView({ behavior: 'smooth', block: 'center' }), 'Voir l’étape'),
        button('timer-time', TimerState.trayText(t, now), () => toggle(btn), t.done ? 'Arrêter' : t.endAt ? 'Mettre en pause' : 'Reprendre'),
        ...(actions.includes('plus1') ? [button('timer-more', '+1 min', () => addMinute(btn), 'Ajouter une minute')] : []),
        close,
      );
      // Ligne 2 : progression, avec la zone « à surveiller » d'une plage.
      const { done, watchFrom } = TimerState.progress(t, now);
      const bar = document.createElement('div');
      bar.className = 'timer-bar';
      if (watchFrom != null) {
        const zone = document.createElement('span');
        zone.className = 'timer-bar-watch';
        zone.style.left = `${watchFrom * 100}%`;
        bar.append(zone);
      }
      const fill = document.createElement('span');
      fill.className = 'timer-bar-fill';
      fill.style.width = `${Math.min(1, done) * 100}%`;
      bar.append(fill);
      row.append(line, bar);
      // Ligne 3, entre les deux bornes : nouveau rappel doux dans 2 minutes.
      if (actions.includes('rappel')) {
        const more = document.createElement('div');
        more.className = 'timer-actions';
        more.append(button('timer-snooze', 'Rappel dans 2 minutes', () => snooze(btn)));
        row.append(more);
      }
      return row;
    }));
  }

  buttons.forEach(btn => btn.addEventListener('click', () => toggle(btn)));

  // Reprise des minuteurs mémorisés. Après un rechargement, le navigateur n'autorise le son
  // qu'après une interaction : le premier toucher sur la page le réactive.
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  try {
    const saved = storeKey ? TimerState.restore(JSON.parse(localStorage.getItem(storeKey)), Date.now()) : [];
    for (const s of saved) {
      const btn = buttons.find(b => b.dataset.timer === s.id);
      if (!btn) continue;
      const t = { label: s.label, html: btn.innerHTML, total: s.total, check: s.check, nextCheck: s.nextCheck, remaining: s.remaining, endAt: s.endAt, done: false, ringing: null };
      timers.set(btn, t);
      if (s.done) ring(t, s.endedAt);
    }
    if (saved.length) update();
  } catch { /* données illisibles : on repart de zéro */ }
})();

// Changement de style sans recharger la page (les minuteurs continuent).
document.querySelectorAll('.site-footer a[data-theme]').forEach(link => link.addEventListener('click', e => {
  e.preventDefault();
  const { theme, css, fonts } = link.dataset;
  const setSheet = (id, href) => {
    let el = document.getElementById(id);
    if (!href) { el?.remove(); return; }
    if (!el) {
      el = Object.assign(document.createElement('link'), { rel: 'stylesheet', id });
      document.querySelector('link[href*="/static/style.css"]').after(el);
    }
    el.href = href;
  };
  setSheet('fonts-css', fonts);
  setSheet('theme-css', css);
  document.body.className = document.body.className.replace(/\btheme-\S+/, `theme-${theme}`);
  document.querySelectorAll('.site-footer a[data-theme]').forEach(a => a.toggleAttribute('aria-current', a === link));
  link.setAttribute('aria-current', 'true');
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
}));

// Suggestions d'étiquettes sous la barre de recherche : clic, Entrée (sur une suggestion choisie
// avec les flèches) ou Tab → filtre par étiquette ; sinon la recherche par mot continue normalement.
(() => {
  const input = document.getElementById('search');
  const list = document.getElementById('tag-suggestions');
  const data = document.getElementById('tags-data');
  if (!input || !list || !data) return;
  let tags = [];
  try { tags = JSON.parse(data.textContent); } catch {}
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let matches = [];
  let active = -1;

  const go = tag => { location.href = `/?tag=${encodeURIComponent(tag.name)}`; };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const highlight = i => {
    active = i;
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', list.children[i].id);
    else input.removeAttribute('aria-activedescendant');
  };

  input.addEventListener('input', () => {
    const q = norm(input.value);
    // Début de l'étiquette ou d'un de ses mots d'abord, puis le reste ; 6 au plus.
    const starts = t => norm(t.name).split(' ').some(w => w.startsWith(q)) || norm(t.name).startsWith(q);
    matches = q ? tags.filter(t => norm(t.name).includes(q)).sort((a, b) => starts(b) - starts(a)).slice(0, 6) : [];
    if (!matches.length) return close();
    list.replaceChildren(...matches.map((t, i) => {
      const li = document.createElement('li');
      li.id = `tag-sugg-${i}`;
      li.setAttribute('role', 'option');
      // Icône SVG d'étiquette fournie par la page (<template id="tag-icon">)
      const tagIcon = document.getElementById('tag-icon');
      if (tagIcon) li.append(tagIcon.content.cloneNode(true), ' ');
      li.append(t.name, Object.assign(document.createElement('span'), { className: 'count', textContent: ` ${t.count}` }));
      li.addEventListener('mousedown', e => { e.preventDefault(); go(t); });
      return li;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(-1);
  });

  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active <= 0 ? matches.length - 1 : active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(matches[active]); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); go(matches[Math.max(active, 0)]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
})();

// Grand écran : un seul bouton (fixe, en tête des résultats) replie / déplie le panneau de filtres ;
// état mémorisé sur l'appareil.
(() => {
  const btn = document.querySelector('.sidebar-toggle');
  if (!btn) return;
  const KEY = 'filtres-replies';
  const set = collapsed => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Afficher les filtres' : 'Masquer les filtres';
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch {}
  };
  let saved = false;
  try { saved = localStorage.getItem(KEY) === '1'; } catch {}
  if (saved) set(true);
  btn.addEventListener('click', () => set(!document.body.classList.contains('sidebar-collapsed')));
})();

// Page recette : colonnes latérales (fiche d'origine, relecture) repliées par défaut.
// Les panneaux flottent par-dessus la page : en dessous de 1500 px, un seul ouvert à la fois
// pour garder la recette lisible ; Échap les referme.
(() => {
  const sides = [...document.querySelectorAll('.side:not(.side-empty)')];
  if (!sides.length) return;
  const set = (side, open) => {
    side.dataset.open = String(open);
    side.querySelector('.side-toggle').setAttribute('aria-expanded', String(open));
  };
  for (const side of sides) {
    side.querySelector('.side-toggle').addEventListener('click', () => {
      const open = side.dataset.open !== 'true';
      if (open && matchMedia('(min-width: 1000px) and (max-width: 1499px)').matches) {
        sides.filter(s => s !== side).forEach(s => set(s, false));
      }
      set(side, open);
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') sides.filter(s => s.dataset.open === 'true').forEach(s => set(s, false));
  });
})();

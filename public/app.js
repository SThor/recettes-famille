// Recherche sur l'accueil
const search = document.getElementById('search');
if (search) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  search.addEventListener('input', () => {
    const q = norm(search.value.trim());
    let any = false;
    document.querySelectorAll('.course').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.card').forEach(card => {
        const show = !q || norm(card.dataset.search).includes(q);
        card.hidden = !show;
        if (show) visible++;
      });
      section.hidden = visible === 0;
      any ||= visible > 0;
    });
    document.getElementById('no-result').hidden = any;
  });
}

// Portions : recalcule les quantités
const recipe = document.querySelector('.recipe[data-servings]');
if (recipe) {
  const base = Number(recipe.dataset.servings);
  let current = base;
  const count = document.getElementById('servings-count');
  const fmt = v => {
    const fractions = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
    const whole = Math.floor(v);
    const rest = Math.round((v - whole) * 100) / 100;
    if (fractions[rest]) return (whole || '') + fractions[rest];
    return String(Math.round(v * 10) / 10).replace('.', ',');
  };
  recipe.querySelectorAll('.servings button').forEach(btn => btn.addEventListener('click', () => {
    current = Math.max(1, current + Number(btn.dataset.step));
    count.textContent = current;
    recipe.querySelectorAll('.qty[data-v]').forEach(el => { el.textContent = fmt(Number(el.dataset.v) * current / base); });
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

  const clock = s => {
    s = Math.max(0, Math.ceil(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

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

  function ring(t) {
    t.done = true;
    t.endAt = null;
    t.remaining = 0;
    const once = () => { beep(); navigator.vibrate?.([300, 150, 300]); };
    once();
    let count = 0;
    t.ringing = setInterval(() => { if (++count >= 40) stopRinging(t); else once(); }, 1500); // ~1 min max
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
      const total = Number(btn.dataset.seconds);
      t = { label: btn.dataset.label, html: btn.innerHTML, total, remaining: total, endAt: null, done: false, ringing: null };
      timers.set(btn, t);
    }
    if (t.done) return stop(btn); // minuteur terminé : un clic l'arrête
    if (t.endAt) { t.remaining = (t.endAt - Date.now()) / 1000; t.endAt = null; } // pause
    else t.endAt = Date.now() + t.remaining * 1000; // départ ou reprise
    update();
  }
  function stop(btn) {
    const t = timers.get(btn);
    if (!t) return;
    stopRinging(t);
    btn.innerHTML = t.html;
    btn.classList.remove('running', 'paused', 'done');
    timers.delete(btn);
    update();
  }

  function update() {
    const now = Date.now();
    for (const [btn, t] of timers) {
      if (t.endAt && t.endAt <= now) ring(t);
      const left = t.endAt ? (t.endAt - now) / 1000 : t.remaining;
      btn.classList.toggle('running', Boolean(t.endAt));
      btn.classList.toggle('paused', !t.endAt && !t.done);
      btn.classList.toggle('done', t.done);
      btn.innerHTML = `⏲&nbsp;${t.done ? 'Terminé !' : clock(left)}`;
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
    tray.replaceChildren(...[...timers].map(([btn, t]) => {
      const row = document.createElement('div');
      row.className = `timer-row${t.done ? ' done' : ''}`;
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'timer-name';
      name.textContent = t.label;
      name.title = 'Voir l’étape';
      name.onclick = () => btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const time = document.createElement('button');
      time.type = 'button';
      time.className = 'timer-time';
      time.textContent = t.done ? 'Terminé !' : `${clock(t.endAt ? (t.endAt - now) / 1000 : t.remaining)}${t.endAt ? '' : ' ⏸'}`;
      time.title = t.done ? 'Arrêter' : t.endAt ? 'Mettre en pause' : 'Reprendre';
      time.onclick = () => toggle(btn);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'timer-stop';
      close.textContent = '✕';
      close.setAttribute('aria-label', `Arrêter le minuteur ${t.label}`);
      close.onclick = () => stop(btn);
      row.append(name, time, close);
      return row;
    }));
  }

  buttons.forEach(btn => btn.addEventListener('click', () => toggle(btn)));
})();

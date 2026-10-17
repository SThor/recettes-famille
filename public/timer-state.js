// État des minuteurs d'une page, partagé entre le navigateur et les tests Node : mémorisation
// (localStorage), phases d'un minuteur à plage, rappel doux, ajout de temps, texte du bandeau.
// Un minuteur : { id, label, total, check, nextCheck, remaining, endAt, done }
//   total     = durée complète en secondes (borne haute d'une plage « 10 à 15 minutes »)
//   check     = borne basse (secondes depuis le départ) : « à surveiller » ensuite ; null sans plage
//   nextCheck = temps restant (s) auquel sonne le prochain rappel doux ; null s'il n'y en a plus
//   endAt     = heure de fin (ms) s'il tourne, sinon remaining = temps restant (s)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimerState = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const FORGET_AFTER = 2 * 60 * 60 * 1000; // un minuteur terminé depuis plus de 2 h est oublié
  const SNOOZE = 120; // « Encore 2 min »
  const EXTRA = 60;   // « +1 min »

  const storageKey = path => `minuteurs:${path}`;

  const clock = s => {
    s = Math.max(0, Math.ceil(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  // Nouveau minuteur (à l'arrêt) depuis les bornes du bouton ; une plage vide = durée simple.
  function create({ label, seconds, secondsMax }) {
    const range = secondsMax > seconds;
    const total = range ? secondsMax : seconds;
    return { label, total, check: range ? seconds : null, nextCheck: range ? total - seconds : null, remaining: total, endAt: null, done: false };
  }

  const leftOf = (t, now) => (t.done ? 0 : t.endAt ? Math.max(0, (t.endAt - now) / 1000) : t.remaining);

  // 'avant' (tranquille), 'surveiller' (entre les deux bornes), 'termine'.
  function phase(t, now) {
    if (t.done) return 'termine';
    return t.check != null && t.total - leftOf(t, now) >= t.check ? 'surveiller' : 'avant';
  }

  const dueCheck = (t, now) => !t.done && t.nextCheck != null && leftOf(t, now) <= t.nextCheck;
  const ackCheck = t => ({ ...t, nextCheck: null });

  // « Encore 2 min » : un nouveau rappel doux dans 2 min, sauf si la fin arrive avant (l'alarme suffit).
  function snooze(t, now, seconds = SNOOZE) {
    const at = leftOf(t, now) - seconds;
    return { ...t, nextCheck: at > 0 ? at : null };
  }

  // « +1 min » : prolonge un minuteur en cours ou en pause ; un minuteur terminé repart pour 1 min.
  function addTime(t, now, seconds = EXTRA) {
    if (t.done) return { ...t, done: false, endedAt: null, total: t.total + seconds, remaining: seconds, endAt: now + seconds * 1000 };
    if (t.endAt) return { ...t, total: t.total + seconds, endAt: t.endAt + seconds * 1000 };
    return { ...t, total: t.total + seconds, remaining: t.remaining + seconds };
  }

  // Texte du bandeau : « Vérifier dans 3:20 », « À surveiller · 4:10 », « 1:00 », « Terminé ! ».
  function trayText(t, now) {
    if (t.done) return 'Terminé !';
    const left = leftOf(t, now);
    const pause = t.endAt ? '' : ' ⏸';
    if (t.check == null) return clock(left) + pause;
    if (phase(t, now) === 'surveiller') return `À surveiller · ${clock(left)}${pause}`;
    return `Vérifier dans ${clock(left - (t.total - t.check))}${pause}`;
  }

  // Barre de progression : part écoulée, et début de la zone « à surveiller » (fraction) pour une plage.
  const progress = (t, now) => ({
    done: t.total ? (t.total - leftOf(t, now)) / t.total : 1,
    watchFrom: t.check != null ? t.check / t.total : null,
  });

  const serialize = (timers, now) => timers.map(t => ({
    id: String(t.id),
    label: String(t.label),
    total: Number(t.total),
    check: t.check ?? null,
    nextCheck: t.nextCheck ?? null,
    remaining: t.endAt ? Math.max(0, (t.endAt - now) / 1000) : Number(t.remaining),
    endAt: t.endAt || null,
    done: Boolean(t.done),
    endedAt: t.done ? (t.endedAt || now) : null,
  }));

  const nullOrNumber = v => v == null || Number.isFinite(v);
  const valid = t => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.label === 'string'
    && Number.isFinite(t.total) && Number.isFinite(t.remaining) && (t.endAt === null || Number.isFinite(t.endAt))
    && nullOrNumber(t.check) && nullOrNumber(t.nextCheck);

  function restore(saved, now) {
    if (!Array.isArray(saved)) return [];
    return saved.filter(valid).map(t => {
      t = { ...t, check: t.check ?? null, nextCheck: t.nextCheck ?? null };
      if (t.endAt && t.endAt <= now) return { ...t, remaining: 0, endAt: null, done: true, endedAt: t.endAt, nextCheck: null };
      // Rappel doux passé pendant l'absence : pas de sonnerie tardive (la phase « à surveiller » s'affiche).
      if (t.nextCheck != null && leftOf(t, now) < t.nextCheck) t.nextCheck = null;
      return t;
    }).filter(t => !t.done || now - (t.endedAt || now) <= FORGET_AFTER);
  }

  return { storageKey, clock, create, leftOf, phase, dueCheck, ackCheck, snooze, addTime, trayText, progress, serialize, restore };
});

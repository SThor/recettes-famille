// Mémorisation des minuteurs d'une page (localStorage), partagée entre le navigateur et les tests Node.
// Un minuteur : { id, label, total, remaining, endAt, done } ; endAt = heure de fin (ms) s'il tourne.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimerState = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const FORGET_AFTER = 2 * 60 * 60 * 1000; // un minuteur terminé depuis plus de 2 h est oublié

  const storageKey = path => `minuteurs:${path}`;

  const serialize = (timers, now) => timers.map(t => ({
    id: String(t.id),
    label: String(t.label),
    total: Number(t.total),
    remaining: t.endAt ? Math.max(0, (t.endAt - now) / 1000) : Number(t.remaining),
    endAt: t.endAt || null,
    done: Boolean(t.done),
    endedAt: t.done ? (t.endedAt || now) : null,
  }));

  const valid = t => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.label === 'string'
    && Number.isFinite(t.total) && Number.isFinite(t.remaining) && (t.endAt === null || Number.isFinite(t.endAt));

  function restore(saved, now) {
    if (!Array.isArray(saved)) return [];
    return saved.filter(valid).map(t => {
      if (t.endAt && t.endAt <= now) return { ...t, remaining: 0, endAt: null, done: true, endedAt: t.endAt };
      return { ...t };
    }).filter(t => !t.done || now - (t.endedAt || now) <= FORGET_AFTER);
  }

  return { storageKey, serialize, restore };
});

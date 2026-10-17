// Recalcul des quantités selon les portions, partagé entre le navigateur et les tests Node.
// Une quantité recalculable porte data-v (et data-v2 pour la borne haute d'une plage « 1 à 2 »).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Quantites = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

  // Nombre lisible : fractions courantes en symboles, sinon une décimale avec virgule.
  const format = v => {
    const whole = Math.floor(v);
    const rest = Math.round((v - whole) * 100) / 100;
    if (FRACTIONS[rest]) return (whole || '') + FRACTIONS[rest];
    return String(Math.round(v * 10) / 10).replace('.', ',');
  };

  // dataset = { v, v2? } ; factor = portions voulues / portions de la recette.
  const scaled = (dataset, factor) => {
    const low = format(Number(dataset.v) * factor);
    return dataset.v2 != null ? `${low} à ${format(Number(dataset.v2) * factor)}` : low;
  };

  return { format, scaled };
});

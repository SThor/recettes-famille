const fs = require('fs');

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit.
function writeAtomic(full, data) {
  const tmp = `${full}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, full);
}

// Date du jour (heure de Paris), au format AAAA-MM-JJ.
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

module.exports = { writeAtomic, today };

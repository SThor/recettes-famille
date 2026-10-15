// Modifie une clé de l'en-tête YAML ligne à ligne, sans reformater le reste du fichier.
function setField(src, key, rawValue) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return `---\n${key}: ${rawValue}\n---\n\n${src}`;
  const nl = m[0].includes('\r\n') ? '\r\n' : '\n';
  const lines = m[1].split(/\r?\n/);
  const line = rawValue === '' ? `${key}:` : `${key}: ${rawValue}`;
  const i = lines.findIndex(l => l.startsWith(`${key}:`));
  if (i >= 0) lines[i] = line; else lines.push(line);
  return src.replace(m[0], `---${nl}${lines.join(nl)}${nl}---`);
}

// Liste YAML en flux, chaque élément entre guillemets (noms de fichiers avec espaces).
const yamlList = items => `[${items.map(s => JSON.stringify(s)).join(', ')}]`;

module.exports = { setField, yamlList };

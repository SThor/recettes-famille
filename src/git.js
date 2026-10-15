// Chaque écriture du site dans le dossier des recettes est commitée, une à la fois.
// Le dépôt reçoit aussi les pushes du vault (receive.denyCurrentBranch=updateInstead),
// d'où l'importance de garder l'arbre de travail propre : on commite tout de suite.
const { execFile } = require('child_process');

function createGit(dir) {
  let queue = Promise.resolve();

  const run = args => new Promise((resolve, reject) => {
    execFile('git', args, { cwd: dir, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
  });

  // Exécute fn (qui écrit des fichiers) puis commite, sans chevauchement entre requêtes.
  function write(message, author, fn) {
    const task = queue.then(async () => {
      const result = await fn();
      await commitAll(message, author);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }

  async function commitAll(message, author) {
    await run(['add', '-A']);
    const status = await run(['status', '--porcelain']);
    if (!status.trim()) return false;
    const args = ['commit', '-q', '-m', message];
    if (author) args.push(`--author=${author.replace(/[<>\n]/g, '')} (site) <recettes@touco.top>`);
    await run(args);
    return true;
  }

  async function isRepo() {
    try { await run(['rev-parse', '--git-dir']); return true; } catch { return false; }
  }

  async function log(n = 15) {
    const out = await run(['log', `-${n}`, '--date=format:%d/%m %H:%M', '--format=%h%x09%ad%x09%an%x09%s']);
    return out.trim().split('\n').filter(Boolean).map(l => {
      const [hash, date, author, subject] = l.split('\t');
      return { hash, date, author, subject };
    });
  }

  // Au démarrage : rattrape d'éventuelles écritures non commitées (crash entre écriture et commit).
  async function init() {
    if (!(await isRepo())) {
      console.warn(`${dir} n'est pas un dépôt git : les modifications de l'admin ne seront pas historisées.`);
      return false;
    }
    if (await commitAll('Rattrapage de modifications non commitées')) console.log('Modifications en attente commitées.');
    return true;
  }

  return { write, log, init, run };
}

module.exports = { createGit };

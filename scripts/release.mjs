// Publication d'une version : vérifications (types + tests) puis builds Windows et Android, puis empreintes SHA-256.
// Utilisation : npm run release          (tout)
//               npm run release -- --sans-android   /   --sans-windows
// Pour changer de version avant : npm version patch --no-git-tag-version   (ou minor / major)
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const withWindows = !args.includes('--sans-windows');
const withAndroid = !args.includes('--sans-android');

// L'éditeur de code peut définir cette variable, qui empêche Electron de se lancer normalement.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function step(title, cmd) {
  console.log(`\n=== ${title}\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

console.log(`Boussole Crypto — publication de la version ${pkg.version}`);
step('1/4 Vérification des types', 'npm run typecheck');
step('2/4 Tests', 'npm test');
if (withWindows) step('3/4 Windows (installeur + version portable)', 'npm run build:exe');
if (withAndroid) step('3/4 Android (APK signée)', 'npm run build:apk');

// Empreintes des fichiers de cette version : permettent de vérifier qu'un fichier copié (clé USB, mail) n'a pas été modifié.
const releaseDir = path.join(root, 'release');
const files = fs.existsSync(releaseDir)
  ? fs.readdirSync(releaseDir).filter((f) => f.includes(pkg.version) && /\.(exe|apk)$/.test(f)).sort()
  : [];
if (!files.length) throw new Error(`Aucun fichier ${pkg.version} dans release/ : la publication a échoué.`);
const lines = files.map((f) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(releaseDir, f))).digest('hex');
  return `${hash}  ${f}`;
});
const sums = path.join(releaseDir, `SHA256-${pkg.version}.txt`);
fs.writeFileSync(sums, `${lines.join('\n')}\n`);
console.log(`\n=== 4/4 Empreintes SHA-256 (${path.relative(root, sums)})\n${lines.join('\n')}`);
console.log(`\n✅ Version ${pkg.version} prête dans release/`);

// 5/5 Annonce de la version dans le depot de synchronisation : les applications ouvertes verront une
// banniere de mise a jour (latestVersion.json, fichier en clair, aucun secret). Best effort : si le
// depot de sync n'est pas joignable, la publication des fichiers reste reussie.
const SYNC_REPO = process.env.BOUSSOLE_SYNC_REPO || 'Nikola17/boussole-sync';
try {
  const versionInfo = JSON.stringify({ version: pkg.version, tag: `v${pkg.version}`, releasedAt: new Date().toISOString() });
  const content = Buffer.from(versionInfo, 'utf8').toString('base64');
  let sha = '';
  try {
    sha = execSync(`gh api "repos/${SYNC_REPO}/contents/latestVersion.json" --jq .sha`, { stdio: ['ignore', 'pipe', 'ignore'], env }).toString().trim();
  } catch {
    sha = ''; // le fichier n'existe pas encore : premiere annonce
  }
  execSync(`gh api -X PUT "repos/${SYNC_REPO}/contents/latestVersion.json" -f message="Boussole : annonce de la version ${pkg.version}" -f content="${content}"${sha ? ` -f sha="${sha}"` : ''}`, { stdio: 'inherit', env });
  console.log(`Annonce de la version ${pkg.version} ecrite dans ${SYNC_REPO} : l'application proposera la mise a jour.`);
} catch {
  console.log(`Attention : latestVersion.json non ecrit dans ${SYNC_REPO} - la banniere de mise a jour ne s'affichera pas. Verifie gh auth.`);
}

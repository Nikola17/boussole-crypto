// Construit l'application Android (.apk) : build web → synchronisation Capacitor → Gradle (release signée).
// Utilisation : npm run build:apk
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const isWin = process.platform === 'win32';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// `secrets` : valeurs (mots de passe) remplacées par *** dans ce qui s'affiche, pour qu'elles n'atterrissent pas dans les journaux.
function run(cmd, cwd = root, env = process.env, secrets = []) {
  const shown = secrets.reduce((s, v) => (v ? s.split(v).join('***') : s), cmd);
  console.log(`\n> ${shown}`);
  execSync(cmd, { cwd, stdio: 'inherit', env });
}

function javaMajor(home) {
  try {
    const out = execSync(`"${path.join(home, 'bin', isWin ? 'java.exe' : 'java')}" -version 2>&1`, { encoding: 'utf8' });
    const m = out.match(/version "(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function findJdk() {
  const candidates = [process.env.BOUSSOLE_JDK, process.env.JAVA_HOME].filter(Boolean);
  const jdks = path.join(os.homedir(), '.jdks');
  if (fs.existsSync(jdks)) for (const d of fs.readdirSync(jdks).sort().reverse()) candidates.push(path.join(jdks, d));
  candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr', path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Android Studio', 'jbr'));
  for (const c of candidates) if (c && fs.existsSync(c) && javaMajor(c) >= 21) return c;
  throw new Error('JDK 21 introuvable. Installe-le (https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip) dans ~/.jdks ou définis BOUSSOLE_JDK.');
}

function findSdk() {
  const c = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk')].filter(Boolean);
  for (const p of c) if (p && fs.existsSync(path.join(p, 'platforms'))) return p;
  throw new Error('SDK Android introuvable (installe Android Studio ou définis ANDROID_HOME).');
}

const jdk = findJdk();
const sdk = findSdk();
console.log(`JDK : ${jdk}\nSDK Android : ${sdk}`);

// Version Android synchronisée avec package.json
const gradleFile = path.join(android, 'app', 'build.gradle');
const [maj, min, pat] = pkg.version.split('.').map(Number);
let gradle = fs.readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${maj * 10000 + min * 100 + pat}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradleFile, gradle);

fs.writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);

// Clé de signature locale (créée une seule fois — à conserver pour pouvoir mettre à jour l'app)
const propsFile = path.join(android, 'keystore.properties');
const storeFile = path.join(android, 'boussole-release.jks');
if (!fs.existsSync(propsFile) || !fs.existsSync(storeFile)) {
  const pass = crypto.randomBytes(18).toString('base64url');
  const keytool = path.join(jdk, 'bin', isWin ? 'keytool.exe' : 'keytool');
  run(`"${keytool}" -genkeypair -v -keystore "${storeFile}" -alias boussole -keyalg RSA -keysize 2048 -validity 10000 -storepass ${pass} -keypass ${pass} -dname "CN=Boussole Crypto, O=Personnel, C=FR"`, root, process.env, [pass]);
  fs.writeFileSync(propsFile, `storeFile=boussole-release.jks\nstorePassword=${pass}\nkeyAlias=boussole\nkeyPassword=${pass}\n`);
  console.log('Clé de signature créée : android/boussole-release.jks (garde-la précieusement avec android/keystore.properties).');
}

run('npx vite build');
run('npx cap sync android');

const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
delete env.ELECTRON_RUN_AS_NODE;
// Chemin complet : certains environnements Windows interdisent l'exécution depuis le dossier courant.
const gradlew = path.join(android, isWin ? 'gradlew.bat' : 'gradlew');
run(`"${gradlew}" assembleRelease --no-daemon`, android, env);

const apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(apk)) throw new Error(`APK introuvable : ${apk}`);
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const out = path.join(root, 'release', `Boussole-Crypto-${pkg.version}.apk`);
fs.copyFileSync(apk, out);
console.log(`\n✅ APK prêt : ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} Mo)`);

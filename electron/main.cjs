// Boussole Crypto — processus principal Electron (application Windows .exe)
const { app, BrowserWindow, shell, session, Menu, Tray, nativeImage, ipcMain, Notification, safeStorage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

// Variable de développement : ignorée dans l'application installée (elle n'autoriserait qu'à pointer le navigateur ailleurs).
const DEV_URL = (!app.isPackaged && process.env.ELECTRON_START_URL) || '';
const APP_ID = 'fr.nseguy.boussole';
const APP_ROOT = path.join(__dirname, '..');
const START_HIDDEN = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let quitting = false;

// Préférences du bureau (zone de notification, démarrage avec Windows) : lues avant la création de la fenêtre.
let desktop = { background: true, autoStart: false, noticeShown: false };
const stateFile = () => path.join(app.getPath('userData'), 'desktop.json');
function loadDesktop() {
  try { desktop = { ...desktop, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) }; } catch { /* premier lancement */ }
}
function saveDesktop() {
  try { fs.writeFileSync(stateFile(), JSON.stringify(desktop)); } catch { /* non bloquant */ }
}

// Sauvegardes automatiques : Documents/Boussole/sauvegardes, hors des données de l'application (elles survivent à une réinstallation).
const KEEP_BACKUPS = { auto: 14, 'avant-import': 5 };
// BOUSSOLE_BACKUP_DIR : dossier de remplacement, utilisé uniquement par les tests automatiques.
const backupDir = () => process.env.BOUSSOLE_BACKUP_DIR || path.join(app.getPath('documents'), 'Boussole', 'sauvegardes');

function writeBackup(kind, content) {
  if (!Object.prototype.hasOwnProperty.call(KEEP_BACKUPS, kind) || typeof content !== 'string' || content.length === 0 || content.length > 60 * 1024 * 1024) {
    return { ok: false, error: 'demande invalide' };
  }
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const name = `boussole-${kind}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  // On ne garde que les plus récentes de chaque type.
  const mine = fs.readdirSync(dir).filter((n) => n.startsWith(`boussole-${kind}-`) && n.endsWith('.json')).sort().reverse();
  for (const old of mine.slice(KEEP_BACKUPS[kind])) {
    try { fs.unlinkSync(path.join(dir, old)); } catch { /* non bloquant */ }
  }
  return { ok: true, path: file };
}

// La navigation ne peut mener que vers les fichiers de l'application elle-même (jamais un file:// arbitraire).
function isAllowedNavigation(url) {
  if (url.startsWith('file://')) {
    try {
      const p = path.normalize(decodeURIComponent(new URL(url).pathname).replace(/^\//, ''));
      return p.startsWith(APP_ROOT);
    } catch { return false; }
  }
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return false;
}

// Sources publiques de l'application : elles seules reçoivent le filet de secours CORS (les autres hôtes échouent franchement).
const CORS_HOSTS = new Set([
  'api.coingecko.com', 'api.binance.com', 'fapi.binance.com', 'data-api.binance.vision', 'api.alternative.me',
  'api.llama.fi', 'stablecoins.llama.fi', 'yields.llama.fi', 'api.geckoterminal.com', 'api.dexscreener.com',
  'lite-api.jup.ag', 'api.gopluslabs.io', 'api.rugcheck.xyz', 'mempool.space', 'api.crypto.com', 'api.github.com',
  'ethereum-rpc.publicnode.com', 'base-rpc.publicnode.com', 'arbitrum-one-rpc.publicnode.com', 'bsc-rpc.publicnode.com',
  'polygon-bor-rpc.publicnode.com', 'avalanche-c-chain-rpc.publicnode.com', 'optimism-rpc.publicnode.com',
  'solana-rpc.publicnode.com', 'api.mainnet-beta.solana.com',
  'www.coindesk.com', 'cointelegraph.com', 'decrypt.co', 'www.theblock.co',
]);

function showWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Icône près de l'horloge : tant qu'elle existe, fermer la fenêtre ne ferme pas l'application (les alertes continuent). */
function ensureTray() {
  if (!desktop.background) {
    if (tray) { tray.destroy(); tray = null; }
    return;
  }
  if (tray) return;
  // tray.png (16 px) et tray@2x.png (32 px, écrans haute densité) : dessin simplifié, lisible en tout petit.
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Boussole Crypto');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Boussole', click: showWindow },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

function applyAutoStart() {
  // Version portable : le programme réel est le .exe d'origine, pas le dossier temporaire où il se décompresse.
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  try { app.setLoginItemSettings({ openAtLogin: desktop.autoStart, ...(portable ? { path: portable } : {}), args: ['--hidden'] }); } catch { /* non bloquant */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    title: 'Boussole Crypto',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
      // Fenêtre masquée : les minuteurs continuent (vérification des alertes toutes les quelques minutes).
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !(START_HIDDEN && desktop.background)) mainWindow.show();
  });

  // Fermer la fenêtre la masque quand l'application reste active en arrière-plan.
  mainWindow.on('close', (event) => {
    if (quitting || !desktop.background) return;
    event.preventDefault();
    mainWindow.hide();
    if (!desktop.noticeShown) {
      desktop.noticeShown = true;
      saveDesktop();
      try {
        new Notification({ title: 'Boussole reste active', body: 'Elle continue en arrière-plan pour t’alerter. Clic droit sur son icône près de l’horloge, puis « Quitter », pour l’arrêter.' }).show();
      } catch { /* non bloquant */ }
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // Les liens externes s'ouvrent dans le navigateur par défaut, jamais dans l'app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID); // nécessaire pour les notifications Windows
  Menu.setApplicationMenu(null);
  loadDesktop();

  // Filet de sécurité CORS : la page est servie en file://, certaines de nos sources publiques
  // n'envoient pas d'en-tête CORS. Seuls les hôtes de l'application le reçoivent, et seulement s'il manque.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    if (details.resourceType === 'xhr') {
      let host = '';
      try { host = new URL(details.url).hostname; } catch { /* laissé vide : aucun hôte */ }
      if (CORS_HOSTS.has(host)) {
        const hasAcao = Object.keys(headers).some((k) => k.toLowerCase() === 'access-control-allow-origin');
        if (!hasAcao) {
          headers['Access-Control-Allow-Origin'] = ['*'];
          headers['Access-Control-Allow-Headers'] = ['*'];
        }
      }
    }
    callback({ responseHeaders: headers });
  });

  // Refuse toute demande de permission non nécessaire (caméra, micro, géoloc...).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications' || permission === 'clipboard-sanitized-write');
  });

  // Préférences du bureau, demandées par l'interface (uniquement depuis la page de l'application).
  const fromApp = (event) => !!event.senderFrame && /^(file:|http:\/\/localhost)/.test(event.senderFrame.url);
  ipcMain.handle('desktop:get', (event) => (fromApp(event) ? { background: desktop.background, autoStart: desktop.autoStart } : null));
  ipcMain.handle('desktop:set', (event, patch) => {
    if (!fromApp(event)) return null;
    if (typeof patch?.background === 'boolean') desktop.background = patch.background;
    if (typeof patch?.autoStart === 'boolean') desktop.autoStart = patch.autoStart;
    saveDesktop();
    ensureTray();
    applyAutoStart();
    return { background: desktop.background, autoStart: desktop.autoStart };
  });

  ipcMain.handle('desktop:backup', (event, kind, content) => {
    if (!fromApp(event)) return null;
    try { return writeBackup(kind, content); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
  ipcMain.handle('desktop:openBackups', async (event) => {
    if (!fromApp(event)) return false;
    try {
      fs.mkdirSync(backupDir(), { recursive: true });
      return (await shell.openPath(backupDir())) === '';
    } catch { return false; }
  });

  // Secrets chiffrés par Windows (safeStorage/DPAPI) : clés API, jeton GitHub, phrase de passe de synchronisation.
  // Rien ne part ailleurs que vers la fenêtre de l'application, et un secret indéchiffrable (autre compte
  // Windows, machine changée) échoue silencieusement : l'utilisateur retape sa clé, rien d'autre n'est touché.
  ipcMain.handle('secrets:encrypt', async (event, value) => {
    if (!fromApp(event) || typeof value !== 'string' || !value) return null;
    try { return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value).toString('base64') : null; } catch { return null; }
  });
  ipcMain.handle('secrets:decrypt', async (event, blob) => {
    if (!fromApp(event) || typeof blob !== 'string' || !blob) return null;
    try { return safeStorage.decryptString(Buffer.from(blob, 'base64')); } catch { return null; }
  });

  // Mise a jour depuis l'application : telecharge l'installeur depuis les releases publiques du depot,
  // puis le lance. Seules ces URL-la sont acceptees, et un installeur incomplet n'est jamais execute.
  ipcMain.handle('desktop:installUpdate', async (event, url) => {
    if (!fromApp(event) || typeof url !== 'string') return { ok: false, error: 'refuse' };
    const okUrl = /^https:\/\/github\.com\/Nikola17\/boussole-crypto\/releases\/download\/v\d+\.\d+\.\d+\/Boussole-Crypto-Setup-\d+\.\d+\.\d+\.exe$/.test(url);
    if (!okUrl) return { ok: false, error: 'source inattendue' };
    const win = BrowserWindow.getAllWindows()[0];
    try {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error('telechargement refuse (HTTP ' + res.status + ')');
      const total = Number(res.headers.get('content-length')) || 0;
      const dest = path.join(os.tmpdir(), 'Boussole-Setup-' + Date.now() + '.exe');
      const out = fs.createWriteStream(dest);
      const reader = res.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out.write(Buffer.from(value));
        received += value.byteLength;
        if (total > 0 && win && !win.isDestroyed()) win.webContents.send('update:progress', Math.round((received / total) * 100));
      }
      await new Promise((resolve, reject) => { out.end((e) => (e ? reject(e) : resolve())); });
      if (received < 1000000) { fs.rmSync(dest, { force: true }); throw new Error('installeur incomplet (' + received + ' octets)'); }
      win?.webContents.send('update:progress', 100);
      spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 400); // l'installeur prend le relais, on libere les fichiers
      return { ok: true };
    } catch (e) {
      win?.webContents.send('update:progress', -1);
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  ensureTray();
  applyAutoStart();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !desktop.background) app.quit();
});

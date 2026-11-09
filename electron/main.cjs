// Boussole Crypto — processus principal Electron (application Windows .exe)
const { app, BrowserWindow, shell, session, Menu, Tray, nativeImage, ipcMain, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEV_URL = process.env.ELECTRON_START_URL || '';
const APP_ID = 'fr.nseguy.boussole';
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

function isAllowedNavigation(url) {
  if (url.startsWith('file://')) return true;
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return false;
}

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
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
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

  // Filet de sécurité CORS : la page est servie en file://, certaines API publiques
  // n'envoient pas d'en-tête CORS. On n'ajoute l'en-tête que s'il manque.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    if (details.resourceType === 'xhr') {
      const hasAcao = Object.keys(headers).some((k) => k.toLowerCase() === 'access-control-allow-origin');
      if (!hasAcao) {
        headers['Access-Control-Allow-Origin'] = ['*'];
        headers['Access-Control-Allow-Headers'] = ['*'];
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

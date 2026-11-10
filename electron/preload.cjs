// Pont minimal et sûr entre l'interface et le processus principal : zone de notification, démarrage avec Windows, sauvegardes.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boussoleDesktop', {
  get: () => ipcRenderer.invoke('desktop:get'),
  set: (patch) => ipcRenderer.invoke('desktop:set', {
    background: typeof patch?.background === 'boolean' ? patch.background : undefined,
    autoStart: typeof patch?.autoStart === 'boolean' ? patch.autoStart : undefined,
  }),
  // Sauvegardes : le processus principal vérifie le type et la taille avant d'écrire.
  backup: (kind, content) => ipcRenderer.invoke('desktop:backup', String(kind), typeof content === 'string' ? content : ''),
  openBackups: () => ipcRenderer.invoke('desktop:openBackups'),
});

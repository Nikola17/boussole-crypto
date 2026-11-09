// Pont minimal et sûr entre l'interface et le processus principal : zone de notification et démarrage avec Windows.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boussoleDesktop', {
  get: () => ipcRenderer.invoke('desktop:get'),
  set: (patch) => ipcRenderer.invoke('desktop:set', {
    background: typeof patch?.background === 'boolean' ? patch.background : undefined,
    autoStart: typeof patch?.autoStart === 'boolean' ? patch.autoStart : undefined,
  }),
});

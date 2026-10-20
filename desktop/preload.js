// Puente mínimo entre la página y Electron: prompt() no existe en Electron, así que se reemplaza por una ventanita propia.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('iaDesktop', {
  prompt: (message, def, lang) => ipcRenderer.sendSync('ia-prompt', String(message ?? ''), def == null ? '' : String(def), String(lang || 'es')),
  openDataFolder: () => ipcRenderer.send('ia-open-data'),
  pickFolder: () => ipcRenderer.invoke('ia-pick-folder'), // selector de carpetas de Windows (carpeta del proyecto)
});

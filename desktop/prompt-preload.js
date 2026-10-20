const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('promptApi', { done: value => ipcRenderer.send('ia-prompt-done', value) });

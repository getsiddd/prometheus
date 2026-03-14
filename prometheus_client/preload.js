const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    notify: (data) => ipcRenderer.send('system-alert', data)
});
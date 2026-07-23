const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yardmateAgent', Object.freeze({
  getState: () => ipcRenderer.invoke('yardmate:get-state'),
  saveSettings: (settings) => ipcRenderer.invoke('yardmate:save-settings', settings),
  testPush: () => ipcRenderer.invoke('yardmate:test-push'),
  chooseDownloadFolder: () => ipcRenderer.invoke('yardmate:choose-download-folder'),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('yardmate:state', handler);
    return () => ipcRenderer.removeListener('yardmate:state', handler);
  },
}));

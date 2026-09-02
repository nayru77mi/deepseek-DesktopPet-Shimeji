const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getBalance: (force) => ipcRenderer.invoke('get-balance', force),
  getLastTurn: () => ipcRenderer.invoke('get-last-turn'),
  onTurnCost: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('turn-cost-updated', handler)
    return () => ipcRenderer.removeListener('turn-cost-updated', handler)
  },
  onConfigChanged: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('config-changed', handler)
    return () => ipcRenderer.removeListener('config-changed', handler)
  },
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setWindowPosition: (x, y) => ipcRenderer.send('set-window-position', x, y),
  setWindowBounds: (bounds) => ipcRenderer.send('set-window-bounds', bounds),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  closeApp: () => ipcRenderer.send('close-app'),
  testCost: (amount) => ipcRenderer.invoke('test-cost', amount),
  testUsageAlert: (amount) => ipcRenderer.invoke('test-usage-alert', amount),
  onUsageAlert: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('trigger-usage-alert', handler)
    return () => ipcRenderer.removeListener('trigger-usage-alert', handler)
  },
})

import { contextBridge, ipcRenderer } from 'electron'

// Expose the local runtime API to the renderer.
// This bridges to the home/ stack running in the main process.
// The key is "fleetRunner" (no "cockpit" in the product name anymore).
contextBridge.exposeInMainWorld('fleetRunner', {
  ping: () => ipcRenderer.invoke('ping'),
  getRuntimeStatus: () => ipcRenderer.invoke('get-runtime-status'),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) =>
    ipcRenderer.invoke('dispatch-intent', args),
  getCurrentState: () => ipcRenderer.invoke('get-current-state'),
  saveToken: (token: string) => ipcRenderer.invoke('save-token', token),
  loadToken: () => ipcRenderer.invoke('load-token'),
  getConfigDir: () => ipcRenderer.invoke('get-config-dir'),
})

import { contextBridge, ipcRenderer } from 'electron'

// Expose the local runtime API to the renderer.
// This bridges to the home/ stack running in the main process.
contextBridge.exposeInMainWorld('cockpit', {
  ping: () => ipcRenderer.invoke('ping'),
  getRuntimeStatus: () => ipcRenderer.invoke('get-runtime-status'),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) =>
    ipcRenderer.invoke('dispatch-intent', args),
  getCurrentState: () => ipcRenderer.invoke('get-current-state'),
})

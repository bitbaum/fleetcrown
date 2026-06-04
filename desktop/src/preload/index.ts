import { contextBridge, ipcRenderer } from 'electron'

// Expose the local runtime API to the renderer.
//
// `window.fleetRunner` is the bridge that lets the React tree (whether the
// bundled IPC dev renderer or the web-shell-loaded fleetcrown.vercel.app)
// reach into the Electron main process: dispatch through the local home/
// runtime, store an agent token, and observe the command poller's live
// status. The web app uses `navigator.userAgent.includes('FleetRunner/')`
// to decide whether this object is present.
contextBridge.exposeInMainWorld('fleetRunner', {
  ping: () => ipcRenderer.invoke('ping'),
  getRuntimeStatus: () => ipcRenderer.invoke('get-runtime-status'),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  dispatchIntent: (args: { projectKey: string; intent: string; queueHead?: string }) =>
    ipcRenderer.invoke('dispatch-intent', args),
  getCurrentState: () => ipcRenderer.invoke('get-current-state'),
  saveToken: (token: string) => ipcRenderer.invoke('save-token', token),
  loadToken: () => ipcRenderer.invoke('load-token'),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  getConfigDir: () => ipcRenderer.invoke('get-config-dir'),

  // Command poller — the cable that closes web → local Zellij. Renderers can
  // either pull a snapshot (`getPollerStatus`) for an immediate read, or
  // subscribe via `onPollerStatus` and react to every state transition (the
  // returned function unsubscribes; React effects must call it on cleanup
  // to avoid stacking listeners across re-mounts).
  getPollerStatus: () => ipcRenderer.invoke('get-poller-status'),
  onPollerStatus: (cb: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => cb(status)
    ipcRenderer.on('poller-status', handler)
    return () => ipcRenderer.removeListener('poller-status', handler)
  },

  // Cloud reconnection — invoked by the bundled local renderer when the
  // user wants to retry the web shell after Fleet Runner fell back to
  // local-only mode (Vercel outage, DB quota, no wifi). probeCloud()
  // returns a quick reachability check; switchToCloud() navigates the
  // window to the web shell. On a fresh failure the did-fail-load hook
  // drops the user back into the bundled renderer automatically.
  probeCloud: (): Promise<boolean> => ipcRenderer.invoke('probe-cloud'),
  switchToCloud: (): Promise<boolean> => ipcRenderer.invoke('switch-to-cloud'),
})

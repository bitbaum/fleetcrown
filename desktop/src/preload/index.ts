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

  // Local prerequisite scan — surface whether agent CLIs (claude, codex,
  // grok, gemini, cursor) and zellij are on PATH. The web app uses this
  // (when running inside Fleet Runner) to render an "Install Claude" CTA
  // instead of silently dispatching to a missing binary.
  getInstalledCLIs: (): Promise<{
    zellij: boolean;
    agents: Record<string, boolean>;
  }> => ipcRenderer.invoke('get-installed-clis'),

  // Local /dev scan — walks ~/dev, ~/code, ~/Code, ~/Projects (overridable
  // via FLEETCROWN_DEV_ROOTS) for git repos. The web app uses this to
  // surface "we see your local repos, register them?" CTAs alongside the
  // GitHub-side suggestions on /control. Returns up to 50 most-recent.
  getLocalDevProjects: (): Promise<{
    projects: Array<{ name: string; path: string; mtimeMs: number; remoteUrl: string | null }>;
  }> => ipcRenderer.invoke('get-local-dev-projects'),

  // Peek tab — snapshot the visible scrollback of a Zellij tab without
  // requiring the user to switch their focused terminal. Implemented in main
  // process via src/lib/zellij.peekTab (focus → dump-screen → restore focus).
  // Returns plain text with ANSI escapes stripped, ready to render in <pre>.
  // v0.7.2+ — older Fleet Runner builds don't expose this, so callers must
  // typeof-check before invoking.
  peekTab: (tab: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('peek-tab', tab),
})

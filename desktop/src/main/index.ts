import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getLocalRuntimeStatus, getProjects, dispatchIntent, getCurrentState } from './runtime'
import { startWatcher } from '@home/watcher'
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { APP_URL } from '@/config/brand'
import {
  startPoller,
  stopPoller,
  restartPoller,
  onPollerStatus,
  getPollerStatus,
  formatTrayTooltip,
} from './poller'

// Web-shell mode — the production default.
//
// Fleet Runner is a native window around the same React tree fleetcrown.vercel.app
// serves. Native IPC remains available via the preload-injected window.fleetRunner
// bridge; the UI itself is the deployed web app, so the desktop and the browser
// stay at parity automatically (one codebase, one source of truth).
//
// FLEETCROWN_WEB_URL overrides the URL (useful for pointing at a preview
// deployment or a local `npm run dev`). The literal value "local" disables
// web-shell entirely and loads the bundled renderer — kept around as the
// development surface for the IPC layer.
const RAW_URL_OVERRIDE = (process.env.FLEETCROWN_WEB_URL || '').trim()
const DISABLE_WEB_SHELL = RAW_URL_OVERRIDE.toLowerCase() === 'local'
const WEB_SHELL_URL = DISABLE_WEB_SHELL ? '' : (RAW_URL_OVERRIDE || APP_URL)
const USE_WEB_SHELL = WEB_SHELL_URL.length > 0

// Resolve a packaged resource file. electron-builder copies `resources/` into
// `process.resourcesPath` at install time; during dev we read it directly from
// the source tree. Returning '' lets callers treat missing files as no-icon
// instead of crashing the process.
function resourcePath(name: string): string {
  const candidates = is.dev
    ? [join(__dirname, '..', '..', 'resources', name)]
    : [join(process.resourcesPath, name), join(process.resourcesPath, 'resources', name)]
  for (const p of candidates) if (existsSync(p)) return p
  return ''
}

const APP_ICON_PATH  = resourcePath('icon.png')
const TRAY_ICON_PATH = resourcePath('tray-icon.png')

let mainWindow: BrowserWindow | null = null
let stopWatcher: (() => void) | null = null
// Tray is lifted to module scope so the poller's status callback can refresh
// its tooltip without going through createTray() every time.
let tray: Tray | null = null
// Refresh the tooltip on a short timer so "last poll Ns ago" stays accurate
// between status events (the long-poll cycle is up to 25s).
let trayTickHandle: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(APP_ICON_PATH ? { icon: APP_ICON_PATH } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Web-shell mode: keep OAuth redirects in the same window instead of spawning
  // a popup Electron can't follow. GitHub's authorize page opens cleanly that
  // way; rejecting it would otherwise break sign-in inside the desktop app.
  if (USE_WEB_SHELL) {
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // Auth flows (GitHub OAuth, NextAuth callback) stay in the main window.
      const isAuthFlow = /\/(api\/)?auth\/|github\.com\/login\/oauth\//i.test(url)
      if (isAuthFlow) {
        mainWindow?.loadURL(url).catch(() => {})
        return { action: 'deny' }
      }
      // Everything else (external links, marketing pages) opens in the user's
      // default browser — desktop apps shouldn't become mini-browsers.
      void import('electron').then(({ shell }) => shell.openExternal(url))
      return { action: 'deny' }
    })
  }

  if (USE_WEB_SHELL) {
    // Spike mode: point the main window at the FleetCrown web app. Same React
    // tree the browser serves runs inside the Electron window. Native APIs
    // remain available via the preload-injected window.fleetRunner bridge.
    console.log(`[desktop] web-shell mode → loading ${WEB_SHELL_URL}`)
    mainWindow.loadURL(WEB_SHELL_URL).catch((err) => {
      console.error('[desktop] failed to load web shell:', err)
      // Fallback to a tiny inline page so the window isn't blank on failure.
      mainWindow?.loadURL(
        `data:text/html,${encodeURIComponent(
          `<body style="background:#000;color:#fff;font-family:sans-serif;padding:40px">
             <h1>Could not reach ${WEB_SHELL_URL}</h1>
             <p>${String(err)}</p>
             <p>Unset FLEETCROWN_WEB_URL to fall back to the bundled renderer.</p>
           </body>`,
        )}`,
      )
    })
    // Open devtools in dev so we can inspect cookies, CSP, network during the spike.
    if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // HMR for renderer based on electron-vite cli (existing flow).
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // IPC for local runtime (integrated home/ stack)
  ipcMain.handle('ping', async () => {
    const status = await getLocalRuntimeStatus()
    return `pong from main (FleetCrown Fleet Runner). Runtime: ${JSON.stringify(status)}`
  })

  ipcMain.handle('get-runtime-status', async () => {
    return getLocalRuntimeStatus()
  })

  ipcMain.handle('get-projects', async () => {
    return getProjects()
  })

  ipcMain.handle('dispatch-intent', async (_event, { projectKey, intent, queueHead }) => {
    return dispatchIntent(projectKey, intent, queueHead)
  })

  ipcMain.handle('get-current-state', async () => {
    return getCurrentState()
  })

  // Token / connect support for using this app as the local runtime for hosted FleetCrown
  // Use the product slug for the local config dir (transition: old ~/.config/cockpit/ tokens are not auto-migrated).
  const configDir = join(homedir(), '.config', 'fleetcrown')
  const tokenFile = join(configDir, 'fleet-runner-token')

  function ensureConfigDir() {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
  }

  ipcMain.handle('save-token', async (_event, token: string) => {
    try {
      ensureConfigDir()
      writeFileSync(tokenFile, token.trim(), 'utf8')
      // Pick up the new token immediately — without this the poller would
      // keep running with the previous token (or stay idle) until the next
      // restart, defeating the "paste and go" UX.
      restartPoller()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('load-token', async () => {
    try {
      if (existsSync(tokenFile)) {
        return readFileSync(tokenFile, 'utf8').trim()
      }
      return null
    } catch {
      return null
    }
  })

  // Used by the in-window auto-mint flow (and Settings UI) when the user
  // wants to disconnect this machine from the control plane without quitting
  // the app — clears the saved token and stops the poller.
  ipcMain.handle('clear-token', async () => {
    try {
      if (existsSync(tokenFile)) unlinkSync(tokenFile)
      stopPoller()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('get-config-dir', async () => {
    return configDir
  })

  // Live connection status — the renderer (and any in-window React tree
  // running inside web-shell mode) can call this for an immediate snapshot,
  // and listen to the 'poller-status' event below for live updates.
  ipcMain.handle('get-poller-status', async () => {
    return getPollerStatus()
  })
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.fleetcrown.fleet-runner')

  // Web-shell mode: mark requests with a Fleet-Runner UA suffix so the deployed
  // app can detect when it's being rendered inside the desktop shell (enabling
  // tray hooks, hotkeys, etc.) without affecting normal browser traffic.
  // Cookies persist by default in Electron's user-data dir → NextAuth session
  // survives across launches with no extra wiring.
  if (USE_WEB_SHELL) {
    const ua = session.defaultSession.getUserAgent()
    if (!ua.includes('FleetRunner/')) {
      session.defaultSession.setUserAgent(`${ua} FleetRunner/${app.getVersion()}`)
    }
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()

  // Start the embedded home/ watcher bridge inside the desktop main process.
  // This gives us the "real worker idle path": when a dispatched agent finishes
  // and writes its handoff to ~/.claude/sessions/<project>.md, we append
  // worker.idle events to the shared log (just like a standalone home/watcher.ts).
  // Combined with the dispatch-side appendEvent(bridge.dispatch + started/crashed),
  // desktop-originated runs now produce a more complete lifecycle in the event log
  // without requiring the user to run a separate watcher process.
  // The watcher respects the same registered projects from agent-projects.conf.
  //
  // The onIdle subscriber surfaces an OS notification for each completed run.
  // This is the "fire-and-walk-away" UX promise of a Fleet Runner: dispatch an
  // intent and the OS pings you when the agent hands off, regardless of which
  // window has focus.
  try {
    const w = startWatcher({ onIdle: notifyOnIdle })
    stopWatcher = w.close
    console.log('[desktop] embedded watcher started for session.md → worker.idle')
  } catch (e) {
    console.warn('[desktop] could not start embedded watcher:', (e as Error).message)
  }

  // Wire the command poller — the cable that closes the web → local Zellij
  // loop. Status updates flow to the tray tooltip and to any renderer window
  // that wants to surface "connected to fleetcrown.vercel.app" in the UI.
  onPollerStatus((status) => {
    if (tray) tray.setToolTip(formatTrayTooltip(status))
    // Push to all renderer windows — web-shell mode means the in-window
    // React tree can show a connection chip without polling IPC.
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('poller-status', status)
    })
  })
  startPoller()
  // Refresh the "last poll Ns ago" string between status events so the
  // tooltip never feels frozen during the 25-second long-poll wait.
  trayTickHandle = setInterval(() => {
    if (tray) tray.setToolTip(formatTrayTooltip(getPollerStatus()))
  }, 5_000)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Ensure the embedded watcher is stopped when the app exits (prevents
// dangling fs.watch handles and pending debounce timers). Same applies
// to the command poller — without aborting it, the long-poll fetch leaves
// the process alive after the windows are closed.
app.on('before-quit', () => {
  if (stopWatcher) {
    try { stopWatcher() } catch { /* ignore */ }
    stopWatcher = null
  }
  if (trayTickHandle) {
    clearInterval(trayTickHandle)
    trayTickHandle = null
  }
  try { stopPoller() } catch { /* ignore */ }
})

function createTray() {
  // Tray icon: the FleetCrown control-window mark, pre-rendered to PNG by
  // desktop/scripts/generate-tray-icon.mjs (kept visually identical to
  // public/icon.svg + BrandMark.tsx; re-run that script if the geometry changes).
  // Falls back to an empty image so the tray still mounts in dev if the file
  // is missing — the menu and click handlers stay functional either way.
  const trayIcon = TRAY_ICON_PATH
    ? nativeImage.createFromPath(TRAY_ICON_PATH)
    : nativeImage.createEmpty()
  tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Fleet Runner', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip(formatTrayTooltip(getPollerStatus()))
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
      }
    }
  })
}

// OS notification fired on each worker.idle event from the embedded watcher.
// Clicking the notification surfaces the main window so the user can act on
// the handoff immediately. Health is encoded in the title so a glance tells
// the user whether a run succeeded.
function notifyOnIdle({ project, handoff }: { project: string; handoff: { done: string; next: string; health: string } }) {
  if (!Notification.isSupported()) return
  const healthBadge = handoff.health === 'good' ? '✓'
    : handoff.health === 'critical' ? '✗'
    : handoff.health === 'needs attention' ? '!'
    : '•'
  const n = new Notification({
    title: `${healthBadge} ${project} — agent idle`,
    body: handoff.done || handoff.next || 'Session handoff written.',
    silent: false,
    ...(APP_ICON_PATH ? { icon: APP_ICON_PATH } : {}),
  })
  n.on('click', () => mainWindow?.show())
  n.show()
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

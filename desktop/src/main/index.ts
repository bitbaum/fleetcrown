import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getLocalRuntimeStatus, getProjects, dispatchIntent, getCurrentState } from './runtime'
import { startWatcher } from '@home/watcher'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'

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

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
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

  ipcMain.handle('get-config-dir', async () => {
    return configDir
  })
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.fleetcrown.fleet-runner')

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
// dangling fs.watch handles and pending debounce timers).
app.on('before-quit', () => {
  if (stopWatcher) {
    try { stopWatcher() } catch { /* ignore */ }
    stopWatcher = null
  }
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
  const tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Fleet Runner', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Fleet Runner')
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

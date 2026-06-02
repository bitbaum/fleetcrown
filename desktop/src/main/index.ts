import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getLocalRuntimeStatus, getProjects, dispatchIntent, getCurrentState } from './runtime'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
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

function createTray() {
  // Placeholder icon; in production add a real png/icns from assets
  const trayIcon = nativeImage.createEmpty()
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

import { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage, Notification, session, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startWatcher } from '@home/watcher'
import { peekTab as peekZellijTab } from '@/lib/zellij'
import { writeFileSync, readFileSync, existsSync } from 'fs'
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
import { startPusher, stopPusher, restartPusher, pushNow } from './pusher'
import { loadToken, saveToken, clearToken, tokenDir } from './token-store'

// v0.7.4 — bundled renderer removed; one UI surface only.
//
// Fleet Runner wraps fleetcrown.vercel.app in a BrowserWindow + adds native
// integrations (tray, deep-link auth, IPC for Peek + auto-mint + local-dev
// scan, auto-update, splash, persisted window bounds). There is no longer
// a parallel local renderer — the cloud /control IS the UI.
//
// Env overrides:
//   - FLEETCROWN_WEB_URL=https://...  → load a preview/dev URL instead of
//                                       the production cloud (for testing).
//   - FLEETCROWN_WEB_URL unset/cloud  → fleetcrown.vercel.app (default).
//
// On load failure (Vercel down, no wifi, OAuth callback to unreachable
// host) the user sees a branded offline page with a retry button, NOT
// a half-working stub UI. The principle: be honest about cloud
// dependency — Slack, Linear, Notion all do the same.
const RAW_URL_OVERRIDE = (process.env.FLEETCROWN_WEB_URL || '').trim()
const isHttpOverride = RAW_URL_OVERRIDE.startsWith('http://') || RAW_URL_OVERRIDE.startsWith('https://')
const WEB_SHELL_URL = isHttpOverride ? RAW_URL_OVERRIDE : APP_URL

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

// Bundled-binary directory. desktop/scripts/download-zellij.mjs drops a
// platform-appropriate `zellij` here at prebuild time and electron-builder
// packs the whole `resources/` tree into the installer. Prepending this to
// PATH means every existing exec("zellij ...") in src/lib/zellij.ts and
// home/worker.ts resolves to the bundled binary first, with the user's own
// $PATH as fallback. No call-site changes needed.
//
// If the bundled binary is missing (dev box that hasn't run prebuild, custom
// build that skipped the script), the PATH still works — the user just has
// to have Zellij installed themselves, the original v0.1.0 contract.
function bundledBinDir(): string {
  const candidates = is.dev
    ? [join(__dirname, '..', '..', 'resources', 'bin')]
    : [join(process.resourcesPath, 'bin'), join(process.resourcesPath, 'resources', 'bin')]
  for (const p of candidates) if (existsSync(p)) return p
  return ''
}

const BUNDLED_BIN_DIR = bundledBinDir()
if (BUNDLED_BIN_DIR) {
  process.env.PATH = `${BUNDLED_BIN_DIR}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
  console.log(`[desktop] bundled bin prepended to PATH: ${BUNDLED_BIN_DIR}`)
}

// Chromium SUID sandbox on Linux AppImage is handled at the AppRun wrapper
// level via `linux.executableArgs: ["--no-sandbox"]` in package.json's
// electron-builder config. We can't fix it here — chrome-sandbox aborts
// the process at FATAL *before* Electron's main.ts ever loads, so any
// app.commandLine.appendSwitch() called here runs too late. The flag
// must be on the kernel-exec'd argv before chrome-sandbox is invoked.
// .deb installs handle this differently: dpkg's postinst chmod 4755's
// the chrome-sandbox helper, so the sandbox works the normal way there.

let mainWindow: BrowserWindow | null = null
let stopWatcher: (() => void) | null = null
// Tray is lifted to module scope so the poller's status callback can refresh
// its tooltip without going through createTray() every time.
let tray: Tray | null = null
// Refresh the tooltip on a short timer so "last poll Ns ago" stays accurate
// between status events (the long-poll cycle is up to 25s).
let trayTickHandle: NodeJS.Timeout | null = null
// Debounce timer for window-state writes so dragging/resizing doesn't hammer
// the disk. Coalesces a burst of move/resize events into a single save.
let saveBoundsHandle: NodeJS.Timeout | null = null

// Loads the bundled local renderer (out/renderer/index.html). Called when:
//   - the cloud web shell fails to load on launch
// Brand black + cream pulled from globals.css :root tokens. Hardcoded here
// because the main process can't import the renderer's CSS — when these
// drift, update both. The splash + offline + window backgroundColor all
// reference these so the user never sees a Chromium-white flash before our
// content paints.
const BRAND_BG = '#0a0a0a'
const BRAND_FG = '#FAF8F5'
const BRAND_ACCENT = '#E06B3A'

// Inline HTML for the splash screen — shown immediately on window create so
// the user sees the brand mark + spinner instead of a black void while the
// real web shell loads. Replaced by the real URL once loadURL resolves.
function splashHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fleet Runner</title>
<style>
  html,body{margin:0;height:100%;background:${BRAND_BG};color:${BRAND_FG};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    user-select:none;-webkit-user-select:none;}
  .logo{width:64px;height:64px;margin-bottom:24px;opacity:0.95;}
  .name{font-size:15px;font-weight:500;letter-spacing:0.01em;opacity:0.85;}
  .status{font-size:11px;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;
    opacity:0.4;margin-top:18px;}
  .spinner{margin-top:14px;width:18px;height:18px;border:1.5px solid rgba(255,255,255,0.12);
    border-top-color:${BRAND_ACCENT};border-radius:50%;animation:spin .9s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<svg class="logo" viewBox="0 0 64 64" fill="none">
  <rect x="6" y="6" width="52" height="52" rx="12" stroke="${BRAND_FG}" stroke-opacity="0.85" stroke-width="2"/>
  <rect x="14" y="18" width="22" height="3.5" rx="1.5" fill="${BRAND_FG}" fill-opacity="0.8"/>
  <rect x="14" y="27" width="30" height="3.5" rx="1.5" fill="${BRAND_FG}" fill-opacity="0.6"/>
  <rect x="14" y="36" width="18" height="3.5" rx="1.5" fill="${BRAND_FG}" fill-opacity="0.45"/>
  <circle cx="47" cy="46" r="3" fill="${BRAND_ACCENT}"/>
</svg>
<div class="name">Fleet Runner</div>
<div class="status">Connecting</div>
<div class="spinner"></div>
</body></html>`
}

// Branded offline page. Replaces the previous bare data-URL fallback so a
// transient network blip or Vercel outage doesn't dump the user in an
// unstyled error. The retry button reloads via IPC (handled below) — the
// user does not need to relaunch the app to recover.
function offlineHtml(targetUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fleet Runner — offline</title>
<style>
  html,body{margin:0;height:100%;background:${BRAND_BG};color:${BRAND_FG};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:40px;box-sizing:border-box;text-align:center;user-select:none;-webkit-user-select:none;}
  h1{font-size:20px;font-weight:600;margin:0 0 8px;letter-spacing:-0.01em;}
  p{font-size:13px;color:rgba(255,255,255,0.55);margin:0 0 24px;max-width:420px;line-height:1.6;}
  .target{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
    padding:6px 10px;border-radius:6px;color:rgba(255,255,255,0.45);margin-bottom:24px;}
  button{background:${BRAND_ACCENT};color:${BRAND_FG};border:0;padding:10px 20px;
    border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;letter-spacing:0.01em;}
  button:hover{filter:brightness(1.08);}
  .hint{margin-top:18px;font-size:11px;color:rgba(255,255,255,0.35);max-width:360px;line-height:1.6;}
</style></head><body>
<h1>Can't reach FleetCrown</h1>
<p>The cloud surface didn't respond. This is usually a transient network
issue or a Vercel hiccup. Your local agents and Zellij tabs are running
regardless — only the /control UI is offline.</p>
<div class="target">${targetUrl}</div>
<button onclick="window.location.assign('${targetUrl}')">Try again</button>
<div class="hint">If this persists, check your connection. Closing and
reopening Fleet Runner is safe — no local data depends on the web app
being up; the daemon keeps pushing state so /control catches up
instantly once it comes back.</div>
</body></html>`
}

const SPLASH_URL = `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`
const OFFLINE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml(WEB_SHELL_URL))}`

// Persist window bounds across launches so users don't have to resize/move
// every time they open Fleet Runner. Stored as JSON in the userData dir
// (~/.config/Fleet\ Runner on Linux, ~/Library/Application\ Support/Fleet\ Runner
// on mac, %APPDATA%/Fleet Runner on Windows). Failure-tolerant: a corrupt
// file just falls back to defaults.
type WindowState = { width: number; height: number; x?: number; y?: number; isMaximized?: boolean }

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1200, height: 800 }
  try {
    const path = windowStateFile()
    if (!existsSync(path)) return defaults
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<WindowState>
    // Clamp to a sane range — display config may have changed between launches
    // and we don't want to restore a window onto a disconnected monitor or at
    // a size that's smaller than the app can render usably.
    return {
      width: clamp(data.width ?? 1200, 800, 4000),
      height: clamp(data.height ?? 800, 600, 4000),
      x: typeof data.x === 'number' ? data.x : undefined,
      y: typeof data.y === 'number' ? data.y : undefined,
      isMaximized: !!data.isMaximized,
    }
  } catch {
    return defaults
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    // Use getNormalBounds() so a maximized window saves the underlying
    // restored size, not the screen dimensions (otherwise un-maximizing
    // next launch leaves the window at screen size).
    const bounds = mainWindow.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized(),
    }
    writeFileSync(windowStateFile(), JSON.stringify(state), 'utf8')
  } catch (e) {
    console.warn('[desktop] could not save window state:', (e as Error).message)
  }
}

function scheduleSaveWindowState() {
  if (saveBoundsHandle) clearTimeout(saveBoundsHandle)
  saveBoundsHandle = setTimeout(saveWindowState, 400)
}

// Native application menu — gives Fleet Runner the File/Edit/View/Window/Help
// structure macOS users expect at the top of the screen, and Linux/Windows
// users expect at the top of the window. Without this the app feels like a
// browser tab in a wrapper. About dialog uses the native About panel on mac;
// Linux/Windows fall back to a styled message box.
function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const showAbout = () => {
    if (isMac) {
      // Native About panel on mac — populated via setAboutPanelOptions in
      // whenReady. Just trigger it.
      app.showAboutPanel()
      return
    }
    void dialog.showMessageBox({
      type: 'info',
      title: 'About Fleet Runner',
      message: 'Fleet Runner',
      detail:
        `Version ${app.getVersion()}\n\n` +
        'The local authoritative desktop application for the FleetCrown AI agent fleet platform.\n\n' +
        '© 2026 Mao Nakamoto · FleetCrown',
      buttons: ['Visit Website', 'Close'],
      defaultId: 1,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) void shell.openExternal('https://fleetcrown.vercel.app')
    })
  }

  const reload = () => mainWindow?.webContents.reload()
  const openExternal = (url: string) => () => void shell.openExternal(url)

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { label: 'Check for Updates…', click: () => void autoUpdater.checkForUpdates() },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: reload },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.reloadIgnoringCache() },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'FleetCrown Website', click: openExternal('https://fleetcrown.vercel.app') },
        { label: 'Quickstart Docs', click: openExternal('https://fleetcrown.vercel.app/docs/quickstart') },
        { label: 'Report an Issue', click: openExternal('https://github.com/maonakamoto/fleetcrown/issues/new') },
        { label: 'View Releases', click: openExternal('https://github.com/maonakamoto/fleetcrown-releases/releases') },
        { type: 'separator' },
        { label: 'Privacy', click: openExternal('https://fleetcrown.vercel.app/privacy') },
        { label: 'Terms', click: openExternal('https://fleetcrown.vercel.app/terms') },
        { label: 'License', click: openExternal('https://fleetcrown.vercel.app/license') },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          { label: 'About Fleet Runner', click: showAbout },
        ]),
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

function createWindow(): void {
  const restored = loadWindowState()
  mainWindow = new BrowserWindow({
    width: restored.width,
    height: restored.height,
    ...(restored.x !== undefined && restored.y !== undefined
      ? { x: restored.x, y: restored.y }
      : {}),
    minWidth: 800,
    minHeight: 600,
    show: false,
    // Brand background so the first paint isn't Chromium-white before our
    // content (splash → web shell) appears. Combined with show:false and
    // ready-to-show, eliminates the white flash entirely.
    backgroundColor: BRAND_BG,
    ...(APP_ICON_PATH ? { icon: APP_ICON_PATH } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // If the previous session ended maximized, restore that state once the
  // window is visible (sized to the saved bounds but expanded to full
  // screen). Doing this before show keeps the transition imperceptible.
  if (restored.isMaximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Persist window geometry across launches. Debounced so a drag/resize
  // gesture doesn't write the file on every pixel of motion.
  mainWindow.on('resize', scheduleSaveWindowState)
  mainWindow.on('move', scheduleSaveWindowState)
  mainWindow.on('maximize', scheduleSaveWindowState)
  mainWindow.on('unmaximize', scheduleSaveWindowState)

  mainWindow.on('close', () => {
    // Flush any pending debounce — the window is going away.
    if (saveBoundsHandle) {
      clearTimeout(saveBoundsHandle)
      saveBoundsHandle = null
    }
    saveWindowState()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Keep OAuth redirects in the same window instead of spawning a popup
  // Electron can't follow. GitHub's authorize page opens cleanly that way;
  // rejecting it would otherwise break sign-in inside the desktop app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Auth flows (GitHub OAuth, NextAuth callback) stay in the main window.
    const isAuthFlow = /\/(api\/)?auth\/|github\.com\/login\/oauth\//i.test(url)
    if (isAuthFlow) {
      mainWindow?.loadURL(url).catch(() => {})
      return { action: 'deny' }
    }
    // Everything else (external links, marketing pages) opens in the user's
    // default browser — desktop apps shouldn't become mini-browsers.
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Catch load failures (Vercel down, no wifi, OAuth callback to unreachable
  // host). did-fail-load fires for every aborted/failed navigation; filter
  // out the ones we trigger ourselves and the ABORTED code that's normal
  // during fast successive loadURL calls. On real failure we show a branded
  // offline page with a retry button — honest about the cloud dependency
  // instead of pretending with a half-working local UI (the v0.7.0 mistake).
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, validatedUrl) => {
    if (code === -3) return // ABORTED — fires harmlessly on every successful navigation
    if (validatedUrl === SPLASH_URL || validatedUrl === OFFLINE_URL) return // our own pages
    if (!validatedUrl.startsWith('http')) return // data: URLs etc.
    console.warn(`[desktop] cloud unreachable (${code}: ${desc}) for ${validatedUrl} — showing offline page`)
    mainWindow?.loadURL(OFFLINE_URL).catch(() => {})
  })

  // Load the brand splash immediately so the user sees Fleet Runner the
  // moment the window paints, not a black void. ready-to-show fires fast
  // for the data: URL, then we swap to the real web shell. Chromium
  // replaces the document in-place when WEB_SHELL_URL finishes loading.
  console.log(`[desktop] booting web shell → splash, then ${WEB_SHELL_URL}`)
  void mainWindow.loadURL(SPLASH_URL)
  // Swap to the real URL on the next tick — gives ready-to-show a chance
  // to fire on the splash first so the window appears with content, not
  // blank. On failure: did-fail-load handler above shows the offline page.
  setImmediate(() => {
    mainWindow?.loadURL(WEB_SHELL_URL).catch((err) => {
      console.error('[desktop] failed to load web shell (did-fail-load will swap to offline page):', err?.message ?? err)
    })
  })
  // Open devtools in dev so we can inspect cookies, CSP, network during the spike.
  if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  // Token / connect support for using this app as the local runtime for hosted FleetCrown.
  // All persistence + path SSOT lives in ./token-store; this section is only the IPC
  // surface + the restart-on-write side effects the renderer wants.
  ipcMain.handle('save-token', async (_event, token: string) => {
    const result = saveToken(token)
    if (result.ok) {
      // Pick up the new token immediately — without this the poller would
      // keep running with the previous token (or stay idle) until the next
      // restart, defeating the "paste and go" UX. Same for the pusher,
      // which marks the daemon as online on the web UI.
      restartPoller()
      restartPusher()
    }
    return result
  })

  ipcMain.handle('load-token', async () => loadToken())

  // Used by the in-window auto-mint flow (and Settings UI) when the user
  // wants to disconnect this machine from the control plane without quitting
  // the app — clears the saved token and stops the poller.
  ipcMain.handle('clear-token', async () => {
    const result = clearToken()
    if (result.ok) {
      stopPoller()
      stopPusher()
    }
    return result
  })

  ipcMain.handle('get-config-dir', async () => tokenDir)

  // Live connection status — the renderer (and any in-window React tree
  // running inside web-shell mode) can call this for an immediate snapshot,
  // and listen to the 'poller-status' event below for live updates.
  ipcMain.handle('get-poller-status', async () => {
    return getPollerStatus()
  })

  // Local-dev scan — walks the user's common dev folders for git repos
  // (whether or not they're registered in agent-projects.conf). The web
  // app uses this (when running inside Fleet Runner) to surface the
  // Cursor-style "we see your local repos, import them?" CTA.
  // Roots are configurable via env; default covers the common layouts.
  ipcMain.handle('get-local-dev-projects', async () => {
    const roots = (process.env.FLEETCROWN_DEV_ROOTS ?? '~/dev:~/code:~/Code:~/Projects')
      .split(':')
      .map((p) => p.trim().replace(/^~/, homedir()))
      .filter(Boolean)

    const fs_ = await import('node:fs/promises')
    const { join } = await import('node:path')

    const found: Array<{ name: string; path: string; mtimeMs: number; remoteUrl: string | null }> = []
    const seen = new Set<string>()

    // Bounded depth-3 scan: most dev folder layouts are at depth 1 (root/repo)
    // or 2 (root/org/repo). 3 catches monorepo sub-projects without exploding.
    async function walk(dir: string, depth: number) {
      if (depth > 3 || seen.has(dir)) return
      seen.add(dir)
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs_.readdir(dir, { withFileTypes: true })
      } catch { return }
      const hasGit = entries.some((e) => e.name === '.git')
      if (hasGit) {
        try {
          const stat = await fs_.stat(dir)
          let remoteUrl: string | null = null
          try {
            const cfg = await fs_.readFile(join(dir, '.git', 'config'), 'utf8')
            const match = cfg.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(\S+)/)
            if (match) remoteUrl = match[1] || null
          } catch { /* no remote configured — fine */ }
          found.push({ name: dir.split('/').pop() ?? dir, path: dir, mtimeMs: stat.mtimeMs, remoteUrl })
        } catch { /* skip on stat error */ }
        return  // don't recurse into .git'd repos — sub-projects are usually a different concept
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (e.name.startsWith('.')) continue
        if (['node_modules', 'dist', 'out', '.next', 'venv', '__pycache__'].includes(e.name)) continue
        await walk(join(dir, e.name), depth + 1)
      }
    }

    for (const root of roots) {
      await walk(root, 0)
    }

    // Most recently modified first — matches "Recent projects" mental model.
    found.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { projects: found.slice(0, 50) }
  })

  // Local prerequisite scan — checks PATH for zellij + each agent CLI.
  // Cached for the lifetime of the process (re-launch to re-detect; CLIs
  // installed mid-session won't appear, which is fine because Fleet Runner
  // restarts on update anyway). Uses shell -c so the scan inherits the
  // user's PATH the same way the daemon's exec calls do.
  let installedCache: { zellij: boolean; agents: Record<string, boolean> } | null = null
  ipcMain.handle('get-installed-clis', async () => {
    if (installedCache) return installedCache
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const has = async (name: string): Promise<boolean> => {
      try {
        await execAsync(`command -v ${name}`, { timeout: 2000 })
        return true
      } catch {
        return false
      }
    }
    const agents: Record<string, boolean> = {}
    for (const a of ['claude', 'codex', 'grok', 'gemini', 'cursor']) {
      agents[a] = await has(a)
    }
    installedCache = { zellij: await has('zellij'), agents }
    return installedCache
  })

  // Peek tab — snapshot the visible scrollback of a Zellij tab without
  // requiring the user to context-switch into the terminal. v0.7.2 ships
  // this so /control can show "what's actually in the tab" inline; the
  // user clicks the eye icon next to a tab name and a drawer opens with
  // the current screen content. Implementation: src/lib/zellij.peekTab
  // (focus → dump-screen → restore focus dance, sub-200ms round-trip).
  //
  // Returns a discriminated result so the renderer can show a specific
  // error message ("tab not open in zellij", "zellij not running") instead
  // of a generic failure. Errors are swallowed at the IPC boundary and
  // converted into {ok:false, error} — never raises across the bridge.
  ipcMain.handle('peek-tab', async (_event, tab: string) => {
    if (typeof tab !== 'string' || tab.trim().length === 0) {
      return { ok: false as const, error: 'invalid tab name' }
    }
    try {
      const content = peekZellijTab(tab.trim())
      return { ok: true as const, content }
    } catch (e) {
      const msg = (e as Error).message || 'peek failed'
      console.warn(`[desktop] peek-tab failed for "${tab}":`, msg)
      return { ok: false as const, error: msg }
    }
  })

  // Reload the web shell from the offline page's retry button. Posts a
  // simple "retry" message via window.postMessage that the offline.html
  // listens for via the preload bridge.
  ipcMain.handle('reload-web-shell', async () => {
    if (!mainWindow) return false
    try {
      await mainWindow.loadURL(WEB_SHELL_URL)
      return true
    } catch (e) {
      console.warn('[desktop] reload-web-shell failed:', (e as Error).message)
      return false
    }
  })
}

// Deep-link auth: clicking `fleetcrown://auth?token=ck_...` from the web app
// (the "Open in Fleet Runner" button on Settings → Agent tokens) hands the
// token to the desktop app without copy-paste. The same flow Slack/Linear use.
//
// Protocol registration:
//   - mac/Windows: app.setAsDefaultProtocolClient handles it directly.
//   - Linux .deb: electron-builder writes a .desktop file declaring
//     x-scheme-handler/fleetcrown, so xdg-open routes the URL to Fleet Runner.
//   - Linux AppImage: protocol routing depends on the user's launcher.
//     AppImageLauncher and most distros pick it up after first run; some
//     don't. The web UI keeps the "copy token" fallback for that case.
//
// Cold-start handling (Linux/Win): a fleetcrown:// click launches Electron,
// and the URL lands in process.argv. We scan it once at boot. Mac uses the
// 'open-url' event (fired before app.whenReady), which we wire below.
app.setAsDefaultProtocolClient('fleetcrown')

// Pending URL captured before the main window exists. Filled by 'open-url'
// on mac when the OS launches Fleet Runner via a deep-link before whenReady
// resolves. The save-token logic consumes it the moment the window opens.
let pendingDeepLink: string | null = null

function extractTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'fleetcrown:') return null
    // Both /auth and //auth host paths are accepted — different platforms
    // produce slightly different URL shapes for custom schemes and we don't
    // want a punctuation difference to break the flow.
    const path = `${u.host}${u.pathname}`.replace(/\/+/g, '/').replace(/^\//, '')
    if (!path.startsWith('auth')) return null
    const tok = u.searchParams.get('token')
    return tok && tok.length >= 8 ? tok : null
  } catch {
    return null
  }
}

function handleDeepLinkUrl(url: string) {
  const tok = extractTokenFromUrl(url)
  if (!tok) {
    console.warn('[desktop] ignored malformed deep-link:', url)
    return
  }
  // Persist via the shared token-store, so there's only one code path for
  // "token reached this machine" — same as save-token IPC + auto-mint flow.
  const result = saveToken(tok)
  if (!result.ok) {
    console.error('[desktop] deep-link auth failed:', result.error)
    return
  }
  restartPoller()
  restartPusher()
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  console.log('[desktop] deep-link auth: token saved, poller + pusher restarted')
}

// Mac: 'open-url' fires when fleetcrown:// is clicked, even before whenReady.
// Buffer it until the window exists.
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) handleDeepLinkUrl(url)
  else pendingDeepLink = url
})

// Linux/Windows: only one Fleet Runner should run. A second invocation (from
// a fleetcrown:// click after the app is already up) triggers second-instance
// with the new argv; we scan it for the deep-link URL and surface the window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith('fleetcrown://'))
    if (url) handleDeepLinkUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.fleetcrown.fleet-runner')

  // Crash reporting via Sentry — opt-in. The SDK is no-op until a DSN is
  // present in the environment (SENTRY_DSN or VITE_SENTRY_DSN), so this
  // ships silent by default. When the Sentry project is created and the
  // DSN is set on the user's machine or build env, uncaught exceptions
  // in the main process (and native crashes via minidumps) start flowing.
  const sentryDsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN
  if (sentryDsn) {
    try {
      const { init } = await import('@sentry/electron/main')
      init({
        dsn: sentryDsn,
        release: `fleet-runner@${app.getVersion()}`,
        environment: is.dev ? 'development' : 'production',
      })
      console.log('[desktop] Sentry main-process reporting enabled')
    } catch (e) {
      console.warn('[desktop] Sentry init failed:', (e as Error).message)
    }
  }

  // Application menu — File / Edit / View / Window / Help with proper
  // shortcuts. macOS gets the application menu (with About, Quit, etc.)
  // as the first item; Linux/Windows skip that. Without this Fleet Runner
  // looks like a webview wrapper instead of a native app.
  Menu.setApplicationMenu(buildAppMenu())

  // Native About panel — used by the {role: 'about'} menu item on macOS
  // (which triggers the system About dialog). On Linux/Windows the menu
  // calls dialog.showMessageBox in buildAppMenu instead.
  app.setAboutPanelOptions({
    applicationName: 'Fleet Runner',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Mao Nakamoto · FleetCrown',
    website: 'https://fleetcrown.vercel.app',
    credits: 'Bundled Zellij, deep-link auth, auto-update.\nPart of the FleetCrown agent-fleet platform.',
  })

  // Linux/Win cold-start: if Fleet Runner was launched directly via a
  // fleetcrown:// click (not while already running), the URL is in argv.
  // Buffer it so we apply it after the window finishes loading.
  const argvUrl = process.argv.find((a) => a.startsWith('fleetcrown://'))
  if (argvUrl) pendingDeepLink = argvUrl

  // Mark requests with a Fleet-Runner UA suffix so the deployed app can detect
  // when it's being rendered inside the desktop shell (enabling tray hooks,
  // hotkeys, etc.) without affecting normal browser traffic. Cookies persist
  // by default in Electron's user-data dir → NextAuth session survives across
  // launches with no extra wiring.
  const ua = session.defaultSession.getUserAgent()
  if (!ua.includes('FleetRunner/')) {
    session.defaultSession.setUserAgent(`${ua} FleetRunner/${app.getVersion()}`)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()

  // Apply any deep-link captured before the window existed (mac open-url
  // pre-whenReady, or Linux/Win argv URL). Token gets saved + poller restarts.
  if (pendingDeepLink) {
    handleDeepLinkUrl(pendingDeepLink)
    pendingDeepLink = null
  }

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
  // Heartbeat to the cloud control plane so the web UI's "Local daemon
  // online" indicator actually reflects reality. v0.4.0–v0.4.3 had the
  // poller (commands cloud → local) but no pusher (state local → cloud),
  // so /control showed "Local daemon offline" even when dispatch was
  // working. See pusher.ts for the why.
  startPusher()
  // Refresh the "last poll Ns ago" string between status events so the
  // tooltip never feels frozen during the 25-second long-poll wait.
  trayTickHandle = setInterval(() => {
    if (tray) tray.setToolTip(formatTrayTooltip(getPollerStatus()))
  }, 5_000)

  // Auto-update — read latest-<platform>.yml from the canonical public
  // release host (maonakamoto/fleetcrown-releases). We override the feed URL
  // explicitly instead of relying on desktop/package.json's publish.repo
  // because electron-builder's build pipeline targets a different repo
  // (maonakamoto/fleetcrown) than where users actually download from. The
  // mirror script reconciles those.
  //
  // Behavior: silent background check on launch, downloads the newer
  // installer in the background if one exists, surfaces a "ready to install"
  // notification when complete. The user keeps using the current version
  // until they relaunch.
  //
  // Disabled in dev (would interfere with the local Electron dev cycle) and
  // when the renderer is in web-shell mode pointed at a non-prod URL
  // (FLEETCROWN_WEB_URL override) — those builds aren't the public binary.
  if (!is.dev) {
    try {
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'maonakamoto',
        repo: 'fleetcrown-releases',
      })
      autoUpdater.on('error', (err) => {
        console.warn('[desktop] auto-update error:', err?.message ?? err)
      })
      autoUpdater.on('update-available', (info) => {
        console.log(`[desktop] auto-update: ${info.version} available (current ${app.getVersion()})`)
      })
      autoUpdater.on('update-downloaded', (info) => {
        console.log(`[desktop] auto-update: ${info.version} downloaded — will install on next quit`)
        if (Notification.isSupported()) {
          new Notification({
            title: `Fleet Runner ${info.version} ready`,
            body: 'Update downloaded — restart Fleet Runner to apply it.',
            silent: true,
            ...(APP_ICON_PATH ? { icon: APP_ICON_PATH } : {}),
          }).show()
        }
      })
      // Fire-and-forget — failures end up on the 'error' listener above.
      void autoUpdater.checkForUpdatesAndNotify()
      console.log('[desktop] auto-update check kicked off (fleetcrown-releases)')
    } catch (e) {
      console.warn('[desktop] auto-update setup failed:', (e as Error).message)
    }
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
  try { stopPusher() } catch { /* ignore */ }
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

  // Surface the window AND navigate to the given path. Used by the tray's
  // quick-link menu items.
  const surfaceAt = (path: string) => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
    const target = new URL(path, WEB_SHELL_URL).toString()
    mainWindow.webContents.loadURL(target).catch((e) => {
      console.warn('[desktop] tray: failed to load', target, e)
    })
  }

  // Quick-link items are deliberately minimal — anything that requires more
  // than one click belongs in the main window's chrome (sidebar, command
  // palette). Tray = "I'm focused elsewhere, just bounce me to the page I
  // need." Order matters: Control (most common entry) first, then create
  // flows, then settings, then quit.
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Fleet Runner', click: () => surfaceAt('/control') },
    { type: 'separator' },
    { label: 'Open Control',       click: () => surfaceAt('/control') },
    { label: 'New project…',       click: () => surfaceAt('/control/new-from-scratch') },
    { label: 'Decisions log',      click: () => surfaceAt('/decisions') },
    { label: 'Sign-in / Settings', click: () => surfaceAt('/settings') },
    { type: 'separator' },
    { label: 'Quit Fleet Runner', click: () => app.quit() }
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
  // v0.6 — push immediately to the cloud so the web UI's SSE feed gets
  // the change within seconds, not after the 5-minute heartbeat. The
  // pushNow() helper coalesces back-to-back calls so a burst of worker.idle
  // events (multiple projects handoffing within the same second) only
  // produces a single round-trip.
  void pushNow().catch(() => { /* non-fatal; next heartbeat picks it up */ })

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

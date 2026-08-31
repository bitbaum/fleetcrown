import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// v0.7.4 — bundled renderer removed.
//
// Pre-0.7.4 the desktop app shipped TWO UI implementations:
//   1. The Next.js app at fleetcrown.orangecat.ch (the real UI, all features)
//   2. A 407-line bundled renderer in src/renderer/ that read agent-projects.conf
//      and never reached feature parity with /control
//
// The two-UI design violated SSOT and produced the v0.7.0 disaster where
// the bundled renderer briefly became the boot target and users saw a
// crippled, dev-surface UI instead of their actual /control page.
//
// Phase 1 of the architecture cleanup deletes the bundled renderer entirely.
// Electron's only job now is to wrap the web shell with native integrations:
// tray, deep-link auth, IPC (peek, auto-mint, local-dev scan), auto-update,
// splash, persistent window state.
//
// This config no longer builds a renderer. main + preload are all that ship.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main'
    },
    resolve: {
      alias: {
        // Allow the main process to reach the existing home/ prototype during porting.
        // Long-term this goes away when we extract packages/local-runtime.
        '@home': resolve(__dirname, '../home'),
        // Temporary: let home/ modules resolve their internal @/lib/... imports
        // (they were written against the web app's tsconfig). We will clean this
        // up properly when extracting the shared runtime package.
        '@': resolve(__dirname, '../src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload'
    }
  }
})

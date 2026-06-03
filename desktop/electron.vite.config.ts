import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'

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
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      outDir: resolve('out/renderer')
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // Match the main-process alias so the renderer can import shared
        // config (e.g. @/config/brand) from the web app's source tree.
        // Goes away when packages/design-tokens + packages/ui are extracted.
        '@': resolve(__dirname, '../src')
      }
    },
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss()]
      }
    }
  }
})
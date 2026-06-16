# Fleet Runner Desktop (for FleetCrown)

This is the native desktop application — the **primary local runtime** for FleetCrown (the "local fleet runner").

See `docs/desktop-app.md` (at repo root) for the full plan, stack decision, architecture, and prioritized execution steps.

## Current status

- Packaged native app (AppImage + .deb produced via electron-builder; macOS/Windows builds wire up via `.github/workflows/desktop-release.yml`).
- **Ships in web-shell mode by default**: the main window loads `https://fleetcrown.orangecat.ch` directly and the user gets the exact same React tree the browser serves, plus native bits (tray, OS notifications on agent idle, persistent NextAuth cookies). One UI, two surfaces.
- Native IPC remains available via the preload-injected `window.fleetRunner` bridge — the web app can detect Fleet Runner via the `FleetRunner/<version>` UA suffix and call into the local runtime where it makes sense.
- Real `home/` stack integration in the main process: loads your projects config from agent-projects.conf, uses `decide()`, renders actual prompts via the orchestration layer (renderTaskForAdapter) on every dispatch.
- Dispatch uses the *canonical* `injectIntoTab` (same code path as the daemon/worker): go-to-tab + focus poll guard (prevents typing into wrong pane) + write-chars + Enter + best-effort restore of previous tab.
- The embedded `home/watcher` reacts to `~/.claude/sessions/*.md` changes and fires a native OS notification on every `worker.idle` event — fire-and-walk-away UX.

### Overriding the shell URL

```bash
# Point the desktop at the hosted production app (default)
FLEETCROWN_WEB_URL=https://fleetcrown.orangecat.ch ./Fleet Runner-0.1.0.AppImage

# Or against a local dev server
FLEETCROWN_WEB_URL=http://localhost:3000 ./Fleet Runner-0.1.0.AppImage

# Disable web-shell entirely and load the bundled renderer (IPC dev surface)
FLEETCROWN_WEB_URL=local npm run dev
```

**Known gaps (prototype phase — desktop-2/3 largely complete for dispatch+idle)**:
- Dispatch uses real `appendEvent` (bridge.dispatch + worker.started/crashed + runId + sentinel).
- The main process now embeds the home/ watcher (startWatcher): fs.watch on ~/.claude/sessions/*.md for registered projects, debounced emit of `worker.idle` with parsed handoff. Desktop-originated runs now produce the full dispatch → started → idle (on handoff) → finished (stop hook) chain in the shared log without a separate watcher process.
- Local UI snapshot still uses an in-process projection; a future slice can tail the log inside the app for a complete local Brain view.
- See `docs/desktop-app.md` for status. Co-running the standalone home/ trio is still supported for headless/transition use.

## Get the runnable app

End users should grab a signed installer from the [download page](https://fleetcrown.orangecat.ch/download). For a local build from source:

```bash
git clone https://github.com/maonakamoto/fleetcrown.git
cd fleetcrown/desktop
npm install
npm run dist:linux    # or dist:mac / dist:win on those platforms
```

Then run:

```bash
chmod +x dist/Fleet\ Runner-0.1.0.AppImage
./dist/Fleet\ Runner-0.1.0.AppImage
```

(Or install the .deb / .dmg / .exe.)

On launch, the app loads the FleetCrown control plane directly. Sign in with the same account you use on the web; native APIs are injected via `window.fleetRunner`, and the embedded watcher fires native notifications when local agents go idle.

## Dev (for contributors)

```bash
cd desktop
npm install
npm run dev
```

## Packaging

```bash
npm run dist          # current platform
npm run dist:linux    # AppImage + deb
# etc.
```

## Cutting a release

`.github/workflows/desktop-release.yml` builds Fleet Runner for macOS, Windows,
and Linux from one tag push and uploads the signed installers to a GitHub
Release. To cut a release:

```bash
cd desktop
npm version patch     # or minor/major — bumps package.json + creates a commit
git tag fleet-runner-v$(node -p "require('./package.json').version")
git push --follow-tags
```

The workflow takes ~10 minutes. Once it's green, the binaries are at:

- `https://github.com/maonakamoto/fleetcrown/releases/latest/download/Fleet-Runner-linux-x86_64.AppImage`
- `https://github.com/maonakamoto/fleetcrown/releases/latest/download/Fleet-Runner-linux-amd64.deb`
- `https://github.com/maonakamoto/fleetcrown/releases/latest/download/Fleet-Runner-mac-x64.dmg`
- `https://github.com/maonakamoto/fleetcrown/releases/latest/download/Fleet-Runner-mac-arm64.dmg`
- `https://github.com/maonakamoto/fleetcrown/releases/latest/download/Fleet-Runner-win-x64.exe`

To test the workflow without minting a real release, dispatch it manually from
the Actions tab with `dry_run: true` — it builds on all three runners but
skips the publish step.

After the first release, update `src/config/marketing-content.ts` to point the
download page's Linux URLs at the `/releases/latest/download/` permalinks and
flip the macOS/Windows platforms from `comingSoon` to `ready`.

The old daemon remains supported for transition / headless use. This desktop app is the future default.

See the root `content/thoughts/the-local-fleet-runner-and-remote-control-plane-architecture.md` and `docs/desktop-app.md` for the full vision and plan.

## Relation to existing code

- Builds on the `home/` stack (the best current local logic).
- The old daemon (`cockpit-daemon.sh`, `home-start.sh`) remains fully supported during transition.
- Long-term: this becomes the default install path.

See the root `content/thoughts/the-local-fleet-runner-and-remote-control-plane-architecture.md` for the strategic "why".

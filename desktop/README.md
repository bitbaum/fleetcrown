# Fleet Runner Desktop (for FleetCrown)

This is the native desktop application — the **primary local runtime** for FleetCrown (the "local fleet runner").

See `docs/desktop-app.md` (at repo root) for the full plan, stack decision, architecture, and prioritized execution steps.

## Current status

- Packaged native app (AppImage + .deb produced via electron-builder).
- x.ai-style minimalist UI: pure black, massive typography, minimal decoration, orange accents only on actions.
- Project list with selection, per-project quick intents (next_best, test_and_fix, close_session), and free-text command bar.
- Real `home/` stack integration in the main process: loads your projects config from agent-projects.conf, uses `decide()`, renders actual prompts via the orchestration layer (renderTaskForAdapter) on every dispatch.
- Dispatch uses the *canonical* `injectIntoTab` (same code path as the daemon/worker): go-to-tab + focus poll guard (prevents typing into wrong pane) + write-chars + Enter + best-effort restore of previous tab.
- "Sync to Web" (after pasting a ck_* agent token) posts runtime snapshot + projects so the hosted control plane at fleetcrown.vercel.app sees this desktop as the live local runner for those projects. Auto-syncs on connect.
- Runs standalone as your local authoritative runtime. Web /control and desktop dispatch both drive the same local Zellij sessions.

**Known gaps (prototype phase — desktop-2/3 largely complete for dispatch+idle)**:
- Dispatch uses real `appendEvent` (bridge.dispatch + worker.started/crashed + runId + sentinel).
- The main process now embeds the home/ watcher (startWatcher): fs.watch on ~/.claude/sessions/*.md for registered projects, debounced emit of `worker.idle` with parsed handoff. Desktop-originated runs now produce the full dispatch → started → idle (on handoff) → finished (stop hook) chain in the shared log without a separate watcher process.
- Local UI snapshot still uses an in-process projection; a future slice can tail the log inside the app for a complete local Brain view.
- See `docs/desktop-app.md` for status. Co-running the standalone home/ trio is still supported for headless/transition use.

## Get the runnable app (Linux example)

```bash
git clone https://github.com/g-but/cockpit.git
cd cockpit/desktop
npm install
npm run dist:linux
```

Then run:

```bash
chmod +x dist/Fleet\ Runner-0.1.0.AppImage
./dist/Fleet\ Runner-0.1.0.AppImage
```

(Or install the .deb.)

In the app:
- Projects from your `agent-projects.conf` are listed.
- Select one, dispatch intents or type custom prompt.
- Paste agent token from FleetCrown web → Settings to connect it as your local runtime.

On macOS/Windows use `npm run dist:mac` or `dist:win` on a machine of that platform.

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

The old daemon remains supported for transition / headless use. This desktop app is the future default.

See the root `content/thoughts/the-local-fleet-runner-and-remote-control-plane-architecture.md` and `docs/desktop-app.md` for the full vision and plan.

## Relation to existing code

- Builds on the `home/` stack (the best current local logic).
- The old daemon (`cockpit-daemon.sh`, `home-start.sh`) remains fully supported during transition.
- Long-term: this becomes the default install path.

See the root `content/thoughts/the-local-fleet-runner-and-remote-control-plane-architecture.md` for the strategic "why".

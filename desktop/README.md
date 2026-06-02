# Fleet Runner Desktop (for FleetCrown)

This is the native desktop application — the **primary local runtime** for FleetCrown (the "local fleet runner").

See `docs/desktop-app.md` (at repo root) for the full plan, stack decision, architecture, and prioritized execution steps.

## Current status

- Packaged native app (AppImage + .deb produced via electron-builder).
- x.ai-style minimalist UI: pure black, massive typography, minimal decoration, orange accents only on actions.
- Real `home/` stack integration in the main process: loads your projects config, uses `decide()`, `applyEvent()`, renders actual prompts via the orchestration layer on dispatch.
- Dispatching a project/intent renders the real prompt the agent would see and updates local runtime state (observable in the UI).
- Runs standalone as your local authoritative runtime.

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
- Paste agent token from Cockpit web → Settings to connect it as your local runtime.

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

/**
 * Fleet Runner release history — SSOT for /releases page + footer version pill.
 *
 * Append a new entry to FLEET_RUNNER_RELEASES per release. The first entry
 * (newest) is treated as "current"; the rest render as a vertical timeline.
 *
 * Editing rules:
 *  - One entry per `fleet-runner-vX.Y.Z` tag pushed to fleetcrown-releases.
 *  - `date` is the GitHub release publishedAt (UTC, ISO 8601).
 *  - `highlights` is 1–6 short user-facing bullets, written as plain English
 *    sentences ending with a period. No commit-message slang ("refactor:",
 *    "fix:"); the audience here is "person who installed Fleet Runner and
 *    wants to know what changed."
 *  - `breaking` is for genuine compat breaks (config rename, removed flag).
 *    Empty array when none.
 *  - `notes` is an optional one-paragraph hand-written explanation of WHY
 *    the release matters. Empty string is fine for routine releases.
 */

export interface ReleaseEntry {
  version: string;          // e.g. "0.7.4"
  tag: string;              // e.g. "fleet-runner-v0.7.4" (matches GitHub release tag)
  date: string;             // ISO 8601 UTC, e.g. "2026-06-07T14:35:53Z"
  highlights: string[];     // user-facing bullets
  breaking: string[];       // compat-breaks, empty if none
  notes: string;            // optional hand-written paragraph; "" if nothing extra to say
}

/** Newest first. */
export const FLEET_RUNNER_RELEASES: ReleaseEntry[] = [
  {
    version: "0.7.5",
    tag: "fleet-runner-v0.7.5",
    date: new Date().toISOString().split("T")[0] + "T00:00:00Z",
    highlights: [
      "In-app update banner — when a newer version is detected, /control shows the exact upgrade path with a one-click Copy button.",
      "On .deb installs (Linux), the banner shows the `sudo dpkg -i <path>` command since electron-updater can't escalate sudo. No more silent update failures.",
      "On AppImage/dmg/exe, the banner has a 'Restart to install' button that triggers electron-updater's quitAndInstall directly.",
      "Banner is dismissable per-version (sessionStorage) so it doesn't nag, but re-appears on the next release.",
    ],
    breaking: [],
    notes: "Permanent fix for the .deb auto-update problem the user surfaced on 2026-06-07: they installed v0.7.0, received zero update notifications across 4 shipped releases (v0.7.1-v0.7.4), and didn't know they were stale. The auto-updater was downloading the new .debs but couldn't apply them — Linux dpkg requires sudo and Electron can't escalate. Now even when auto-apply fails, the user always sees what to do.",
  },
  {
    version: "0.7.4",
    tag: "fleet-runner-v0.7.4",
    date: "2026-06-07T14:35:53Z",
    highlights: [
      "Removed the bundled local renderer entirely — Fleet Runner is now a clean Electron wrapper around the cloud /control UI.",
      "Fixes the v0.7.0 boot disaster where users saw a half-working stub with 'YOUR MACHINES. YOUR AGENTS.' and zero projects.",
      "Smaller binary, no dependency on `agent-projects.conf` local file, no parallel-UI drift risk.",
      "Splash → web shell transition is the only boot path; clean offline page if cloud is unreachable.",
    ],
    breaking: [],
    notes: "Architectural cleanup. The bundled renderer was an aspirational 'local-first' surface that never reached parity with /control. Deleting it (2,135 lines) puts Fleet Runner in the same category as Slack / Linear / Notion desktop: web UI + native integrations (tray, deep-link auth, IPC for Peek + auto-mint + local-dev-scan, auto-update).",
  },
  {
    version: "0.7.3",
    tag: "fleet-runner-v0.7.3",
    date: "2026-06-07T12:35:45Z",
    highlights: [
      "Clear stale auth tokens automatically when the server rejects them (401/403).",
      "Renamed window title from 'Cockpit Fleet Runner' (legacy pre-rename) to 'Fleet Runner'.",
      "Pusher and poller now signal token-invalid back to the auto-mint flow, so a dead token recovers without user intervention.",
    ],
    breaking: [],
    notes: "Fixes a real bug where a revoked token would lock the user permanently offline — auto-mint's 'if existing token, bail' guard kept reusing the dead one. Now the daemon deletes bad tokens on 401, and the next /control load mints a fresh one from the signed-in browser session.",
  },
  {
    version: "0.7.2",
    tag: "fleet-runner-v0.7.2",
    date: "2026-06-06T13:12:25Z",
    highlights: [
      "Peek tab feature — eye-icon button on /control's workspaces table opens a drawer showing the live screen contents of any Zellij tab.",
      "Sub-200ms round-trip per peek; auto-refresh toggle re-snapshots every 3s for watching long-running agents.",
    ],
    breaking: [],
    notes: "Closes the biggest visibility gap in /control: you could see tab names and state chips but had to alt-tab into Zellij to see what an agent was actually saying. Peek brings the agent's view into FleetCrown itself.",
  },
  {
    version: "0.7.1",
    tag: "fleet-runner-v0.7.1",
    date: "2026-06-06T12:51:05Z",
    highlights: [
      "Reverted the v0.7.0 'bundled-renderer-as-primary' boot flip.",
      "Fleet Runner opens fleetcrown.vercel.app inside Electron again — the same UI you know from the browser.",
      "Updated download CTA on the marketing site to point at the latest release dynamically.",
    ],
    breaking: [],
    notes: "Emergency revert. v0.7.0 shipped the bundled renderer as the default boot target before it had parity with /control, which produced the 'YOUR MACHINES. YOUR AGENTS. / 0 projects / Sync error: Failed to fetch' screen. v0.7.4 later deletes the bundled renderer entirely; v0.7.1 was the safe rollback to v0.6 behavior in the meantime.",
  },
  {
    version: "0.7.0",
    tag: "fleet-runner-v0.7.0",
    date: "2026-06-06T10:11:13Z",
    highlights: [
      "Per-project autopilot mode override (UI toggle on each ProjectCard).",
      "Typed command boundary at the desktop runtime (zod-validated commands from cloud).",
      "Autonomous scheduler that nudges idle projects when no human dispatch happens.",
      "Beacon /tmp/*.json migrated to the cloud DB for cross-device visibility.",
    ],
    breaking: [
      "Bundled renderer became the default boot target — produced a broken UX, reverted in v0.7.1, removed entirely in v0.7.4.",
    ],
    notes: "Major v0.6 → v0.7 cut. Several real features landed (autopilot, typed boundary, scheduler) but the Phase C 'make the bundled renderer the primary' change went out before parity work was done. v0.7.1 reverted that part; v0.7.4 deleted the bundled renderer for good.",
  },
  {
    version: "0.6.0",
    tag: "fleet-runner-v0.6.0",
    date: "2026-06-05T10:32:36Z",
    highlights: [
      "Real-time updates via Postgres LISTEN/NOTIFY + SSE bridge — replaces the v0.5 30-second polling.",
      "Sub-second latency from DB row change → browser UI update.",
      "Bridge server runs on bridge.orangecat.ch (Hetzner CX22), reachable from desktop + web + mobile.",
      "Daemon pusher is event-driven (worker.idle from session.md changes) instead of pure heartbeat.",
    ],
    breaking: [],
    notes: "The architectural foundation for everything that came after. Pre-v0.6, /control polled /api/control every 30s and the daemon-offline indicator was always lying about staleness. v0.6 inverts the dataflow: clients subscribe to an SSE stream, the bridge LISTENs on Postgres NOTIFY events, every row change fans out to connected clients within milliseconds.",
  },
  {
    version: "0.5.1",
    tag: "fleet-runner-v0.5.1",
    date: "2026-06-04T06:41:38Z",
    highlights: [
      "Offline fallback: when the cloud is unreachable, Fleet Runner falls back to a branded offline page with retry.",
      "Local agent operations keep working when the cloud is down (poller, pusher, watcher all decoupled).",
    ],
    breaking: [],
    notes: "",
  },
  {
    version: "0.5.0",
    tag: "fleet-runner-v0.5.0",
    date: "2026-06-04T06:31:33Z",
    highlights: [
      "Local-first contract: Fleet Runner is functional even when the cloud is unreachable.",
      "Bundled Zellij binary in resources/ — first-launch works without a separate Zellij install.",
      "Native application menu (File / Edit / View / Window / Help) instead of webview-style chrome.",
    ],
    breaking: [],
    notes: "",
  },
  {
    version: "0.4.4",
    tag: "fleet-runner-v0.4.4",
    date: "2026-06-03T21:08:51Z",
    highlights: [
      "Splash screen on launch (brand mark + spinner) — eliminates the Chromium-white flash before the web shell paints.",
      "Persisted window bounds across launches (geometry + maximized state).",
      "Deep-link auth: clicking `fleetcrown://auth?token=...` from the web app hands a fresh token to the desktop without copy-paste.",
    ],
    breaking: [],
    notes: "",
  },
];

/** Most-recent release — used by the footer pill / 'current version' badges. */
export const CURRENT_RELEASE: ReleaseEntry = FLEET_RUNNER_RELEASES[0];

/**
 * Daemon timing contract — SSOT for the web ↔ Fleet Runner heartbeat cadence.
 *
 * Pre-2026-06-06 these numbers lived three places that had to agree but
 * weren't enforced to: `pusher.ts` sent a heartbeat every 5 minutes,
 * `ControlPanel.tsx` flagged "offline" at >90s since last push, and the
 * `pusher.ts` source comment explicitly admitted "the 90s threshold is too
 * aggressive for this cadence." Real bug: between heartbeats, /control
 * briefly read "Daemon offline" even when Fleet Runner was happily running
 * — there was a 4½-minute window each cycle where the UI lied.
 *
 * The fix is one file owning all three numbers, with the threshold expressed
 * as a multiple of the cadence so they can't drift apart. Imported by both
 * the web app (via @/lib/constants/daemon) and the desktop main process (the
 * `@` alias is wired through electron.vite.config.ts).
 */

/**
 * How often Fleet Runner's pusher posts a heartbeat to /api/control/runtime-
 * state. Steady-state only — real state changes still push immediately via
 * `pushNow()` from the embedded watcher (worker.idle → instant push).
 *
 * 5 minutes balances "daemon shows online quickly when Fleet Runner launches"
 * against "don't burn the user's bandwidth + the cloud's write quota on a
 * mostly-idle fleet". Faster than 5min adds noise; slower delays the
 * online-after-launch reveal past the user's patience window.
 */
export const DAEMON_HEARTBEAT_MS = 5 * 60_000;

/**
 * How stale a daemon push can get before the web UI flips its banner to
 * "offline". Computed from the heartbeat cadence: 1.5× the interval gives
 * the daemon room for one missed heartbeat (network blip, brief sleep)
 * before we declare it offline. The +30s grace is for clock skew between
 * desktop and Vercel — without it, a perfectly healthy daemon flickered
 * "offline" for a second every 5 minutes as the next push raced the
 * threshold.
 *
 * 7.5min + 30s = 7m30s. If you raise the heartbeat cadence, this auto-
 * scales — no second site to remember to update.
 */
export const DAEMON_OFFLINE_THRESHOLD_MS = Math.round(DAEMON_HEARTBEAT_MS * 1.5) + 30_000;

/**
 * Long-poll wait window the desktop poller asks /api/control/commands for.
 * The API caps any client-supplied `wait` at this value (see commands/route.ts)
 * so a misbehaving client can't pin a Vercel function for longer than this.
 * 25s is short enough to stay under Vercel's 60s function timeout with margin
 * for the response handshake, long enough that 99% of the time the next
 * polling cycle starts with a real command rather than an empty drain.
 */
export const DAEMON_LONG_POLL_SECONDS = 25;
export const DAEMON_LONG_POLL_MS = DAEMON_LONG_POLL_SECONDS * 1_000;

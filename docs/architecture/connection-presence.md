# Connection-based runner presence

**Status:** rolling out (additive → cutover)
**Replaces:** the 5-minute `runtime-state` heartbeat + 8-minute offline threshold.

## Why

The web UI's "Fleet Runner online/offline" used to be inferred from the freshness
of a periodic `POST /api/control/runtime-state` heartbeat (every
`RUNNER_HEARTBEAT_MS` = 5 min; offline if older than ~8 min). Consequences:

- A healthy runner looked **offline for up to 8 minutes** after any restart.
- Presence was a *guess* derived from a timer, not a fact.

That is the legacy daemon-polling pattern. Presence should be a property of the
**live connection**, the way modern realtime systems do it.

## The model

The runner already holds a persistent SSE connection to the **bridge**
(`bridge/src/server.ts`, Hetzner). That connection *is* the presence signal:

```
runner connects to bridge (?client=runner)
   → bridge: runner_presence.connection_count++, connected=true   (instant)
runner's socket closes (quit / crash / network)
   → bridge: connection_count--, connected = count>0              (instant, <1s)
web /control reads runner_presence.connected                      (no timer)
```

- **Online = an open runner→bridge connection.** Not a heartbeat age.
- The browser also connects to the bridge, so the runner tags itself
  `?client=runner`; only runner connections move presence.
- Reconnect-safe via a connection **count** (multiple machines / brief overlaps).
- **Bridge boot resets all counts to 0** — a fresh bridge holds no connections,
  so any stale `connected=true` from a crash is cleared on the next deploy.

State (tab list, which agents are running) is pushed **on change only**
(`pushNow()` from the runner's watcher), never on a clock.

## Components

| Layer | Change |
|-------|--------|
| DB | new `runner_presence` table (`user_id` PK, `connection_count`, `connected`, `connected_at`, `last_change_at`) |
| Bridge | parse `?client`; on runner connect/disconnect, upsert `runner_presence`; reset counts to 0 on boot |
| Runner | `bridge-subscriber.ts` adds `?client=runner`; heartbeat pusher timer removed (event-driven `pushNow` kept) |
| Web | online = `runner_presence.connected` **OR** heartbeat-fresh (additive) → then heartbeat branch removed at cutover |

## Rollout (no breakage)

1. **Migration** — add `runner_presence` (box DB). Inert until written.
2. **Bridge** — deploy presence accounting. Still no consumer; safe.
3. **Web** — online reads `connected OR heartbeat-fresh`. Both paths valid.
4. **Desktop** — rebuild + install runner with `?client=runner`. Now presence is live.
5. **Verify** — restart runner, confirm /control flips online in <2s.
6. **Cutover** — drop the heartbeat `setInterval` in the runner and the
   heartbeat branch in the web online check. Presence is purely connection-based.

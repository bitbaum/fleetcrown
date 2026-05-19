# `home/` — local Brain

The Brain runs as a small Node HTTP server on the user's machine.
It tails an append-only JSONL event log, projects events into per-project
state, and serves a status view at `http://localhost:3001`.

This is **M2** of the greenfield rewrite — the smallest possible thing that
proves the event-log → state projection → UI loop. No agent dispatch yet,
no decisions, no React. M3 wires the Bridge that feeds real events in.

## Run

```bash
npx tsx home/server.ts
```

Open `http://localhost:3001` — the UI polls `/api/state` every 2s.

Override the port with `APP_HOME_PORT=3801`.

## Test it

```bash
# In another terminal — derive the slug from brand.ts
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)
mkdir -p ~/.$SLUG

# Simulate a run starting
cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"worker.started","project":"Demo","adapter":"claude","intent":"next_best"}
EOF

# The Demo project shows up on the UI with a green "next_best" pill within 1s.

# Simulate it finishing
cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"worker.finished","project":"Demo","outcome":"success","durationMs":60000,"handoff":{"done":"shipped a thing","next":"","tests":"","todos":"","health":"good"}}
EOF

# The pill clears, a ✓ glyph appears in the outcome streak.
```

## Files

| File         | Purpose                                                            |
|--------------|--------------------------------------------------------------------|
| `state.ts`   | Pure `applyEvent(state, event) → state`. Tested by replaying logs. |
| `log.ts`     | Tail one JSONL file, parse via `@/lib/events`, handle file resets. |
| `server.ts`  | Node HTTP server. `/control` HTML + `/api/state` + `/api/health`.  |

## What's not here yet

- **Bridge** (M3): worker hooks emit events to the log. Today you append manually.
- **decide()** (M5): pure function turning state into next action. Today the brain only watches.
- **Dispatch wire-back** (M6): brain commands flow into workers. Today nothing acts on `bridge.dispatch`.
- **Persistence**: state is in-memory. Restart replays the full log to rebuild. This is by design — the log is the only durable thing.

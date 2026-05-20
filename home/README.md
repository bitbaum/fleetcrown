# `home/` — local Brain + Bridge + Worker

The new system runs as three small Node processes on the user's machine,
all tailing the same append-only JSONL event log:

```
~/.${APP_SLUG}/events.jsonl     ←  every event ever, version-stamped, one per line

  ┌─────────────┐    ┌───────────┐    ┌──────────────┐
  │  watcher.ts │    │ server.ts │    │  worker.ts   │
  │   (Bridge)  │    │  (Brain)  │    │  (Consumer)  │
  ├─────────────┤    ├───────────┤    ├──────────────┤
  │ session.md  │    │ tails log │    │ tails log    │
  │ changes     │    │ projects  │    │ filters for  │
  │ → worker.   │    │  state    │    │ bridge.      │
  │   idle      │    │ serves    │    │   dispatch   │
  │   events    │    │  /api/*   │    │ → injects    │
  └─────────────┘    │ runs      │    │   via zellij │
                     │  decide() │    │ → worker.    │
                     └───────────┘    │   started    │
                                      └──────────────┘
```

## Run

Three terminals (or one tmux/zellij with three panes):

```bash
npx tsx home/server.ts     # Brain — http://localhost:3001
npx tsx home/watcher.ts    # Bridge — emits worker.idle when sessions change
npx tsx home/worker.ts     # Consumer — injects bridge.dispatch into zellij
```

Override the Brain port with `APP_HOME_PORT=3801`. Override the watcher
sessions dir with `APP_SESSIONS_DIR=/tmp/test-sessions` (for testing).

## Smoke test — append a worker.started event manually

```bash
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)
mkdir -p ~/.$SLUG

cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"worker.started","project":"Demo","adapter":"claude","intent":"next_best"}
EOF

# UI at http://localhost:3001 shows a Demo project with a green next_best pill.
```

## Smoke test — dispatch via the API

```bash
# In a third terminal — auto-mode triggers the worker if confidence allows.
curl -s -X POST http://localhost:3001/api/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"Demo","autonomy":"auto","queueHead":"run the smoke test"}'

# worker.ts injects "run the smoke test" into the Demo zellij tab and
# appends a worker.started event. The UI reflects it on the next poll.
```

## Files

| File          | Purpose                                                                          |
|---------------|----------------------------------------------------------------------------------|
| `state.ts`    | Pure `applyEvent(state, event) → state`.                                         |
| `log.ts`      | Tail one JSONL file, parse via `@/lib/events`. Phase flag (replay/live).         |
| `emit.ts`     | Single append-only writer. Stamps `v` + `id` + `ts` at write time.               |
| `render.ts`   | Thin adapter over `@/lib/orchestration` to render full dispatch prompts.         |
| `decide.ts`   | Pure decision function: `(state, queueHead, autonomy) → action + confidence`.    |
| `server.ts`   | HTTP server — `/control` HTML + `/api/state` + `/api/health` + `POST /api/dispatch`. |
| `watcher.ts`  | M3 Bridge. Watches `~/.claude/sessions/*.md`, emits `worker.idle`.               |
| `worker.ts`   | M8 Consumer. Acts on `bridge.dispatch`, injects via zellij, emits `worker.started`. |

## Idempotency

The worker is safe to restart. On boot, it replays the entire log to build
the set of `runId`s that already have a `worker.started` event downstream
— those dispatches are considered handled and won't fire again. Dispatches
in the log that *don't* yet have a matching `worker.started` are treated
as crash-recovery and re-injected after replay completes.

## What's not here yet

- **Persistence beyond the log**: state is in-memory. Restart replays.
  This is by design — the log is the only durable thing.
- **Cutover from `/api/control/dispatch`**: the existing Vercel route still
  exists. Once this loop is exercised against real agents, M9 retires it
  and the daemon stops shipping pending_commands rows.

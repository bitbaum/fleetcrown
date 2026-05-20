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

One command starts all three processes, tags each line of output with its
source, and shuts them down together on Ctrl-C:

```bash
bash scripts/home-start.sh
# UI at http://localhost:3001
# Logs merged into /tmp/<APP_SLUG>-home.log — tail -f to see all three.
```

Or run them individually in separate terminals (useful when iterating on
one process at a time). All three require an explicit `--start` flag —
naked invocations print a usage banner and exit 0 so accidental
`| tail -N` pipes don't leave orphaned watchers behind:

```bash
npx tsx home/server.ts  --start   # Brain — http://localhost:3001
npx tsx home/watcher.ts --start   # Bridge — emits worker.idle when sessions change
npx tsx home/worker.ts  --start   # Consumer — injects bridge.dispatch into zellij
npx tsx home/worker.ts  --self-test   # Inline tests, no I/O
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

The four autonomy modes gate auto-execution differently:

| Mode      | Threshold | Use case                                                |
|-----------|-----------|---------------------------------------------------------|
| `manual`  | 0 (none)  | Human clicked Dispatch — fires on receipt               |
| `confirm` | ∞ (never) | Show the proposal so the human can review               |
| `auto`    | 0.55      | Autonomous scheduler (cron, queue drain), moderate gate |
| `sleep`   | 0.75      | Autonomous while-away, high-confidence gate             |

A fresh project has `confidence = 0.5`, so only `manual` fires immediately.
Use `confirm` to see the proposed action without firing:

```bash
# Fire now (human-initiated).
curl -s -X POST http://localhost:3001/api/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"Demo","autonomy":"manual","queueHead":"run the smoke test"}'

# See what the brain would do, without firing.
curl -s -X POST http://localhost:3001/api/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"Demo","autonomy":"confirm"}'
```

When fired, `worker.ts` injects "run the smoke test" into the `Demo`
zellij tab and appends a `worker.started` event. The UI reflects it on
the next 2s poll.

## Smoke test — cancel an in-flight run

```bash
# Sends Ctrl+C to the project's zellij tab via the worker, and tags the
# eventual worker.finished's outcome as user_abort in recentOutcomes
# (the bash stop hook can only infer success/partial/error/hang).
curl -s -X POST http://localhost:3001/api/cancel \
  -H 'Content-Type: application/json' \
  -d '{"project":"Demo","reason":"changed my mind"}'
```

## Files

| File          | Purpose                                                                          |
|---------------|----------------------------------------------------------------------------------|
| `state.ts`    | Pure `applyEvent(state, event) → state`. Re-labels cancelled runs as `user_abort`. |
| `log.ts`      | Tail one JSONL file, parse via `@/lib/events`. Phase flag (replay/live).         |
| `emit.ts`     | Single append-only writer. Stamps `v` + `id` + `ts` at write time.               |
| `render.ts`   | Thin adapter over `@/lib/orchestration` to render full dispatch prompts.         |
| `decide.ts`   | Pure decision function: `(state, queueHead, autonomy) → action + confidence`.    |
| `projects.ts` | Reads `~/.config/agent-projects.conf` — the tab→path SSOT.                      |
| `server.ts`   | HTTP server — `/control` HTML + `/api/state` + `/api/health` + `POST /api/dispatch` + `POST /api/cancel` + `POST /api/events`. |
| `watcher.ts`  | M3 Bridge. Watches `~/.claude/sessions/*.md`, emits `worker.idle`. Filters to registered projects only. |
| `worker.ts`   | M8 Consumer. Acts on `bridge.dispatch` (inject) and `bridge.cancel` (Ctrl+C), emits `worker.started` / `worker.crashed`. |

## Idempotency

The worker is safe to restart. On boot, it replays the entire log to build
the set of `runId`s that already have a `worker.started` event downstream
— those dispatches are considered handled and won't fire again. Dispatches
in the log that *don't* yet have a matching `worker.started` are treated
as crash-recovery and re-injected after replay completes.

## Inline self-tests

Every module in `home/` ships with an inline test suite — no separate test
runner, no framework, no external deps. Each suite runs in <1s. Run them
individually while iterating, or all at once before committing:

```bash
npx tsx home/state.ts                # 15 tests — event projection
npx tsx home/decide.ts               # 11 tests — autonomy + confidence
npx tsx home/projects.ts             #  7 tests — agent-projects.conf parser
npx tsx home/render.ts               # 12 tests — every intent renders
npx tsx home/emit.ts    --self-test  #  5 tests — append-only writer
npx tsx home/log.ts     --self-test  #  6 tests — JSONL tailer (replay path)
npx tsx home/watcher.ts --self-test  #  8 tests — parseHandoff + tabFromFilename
npx tsx home/worker.ts  --self-test  # 12 tests — applyEvent pure-function path
```

`server.ts` is currently exercised only by `npm run smoke` (boots the dev
server and curls every route) — its HTTP route handlers are tightly bound
to req/res streams, so unit-testing them in isolation would require
mocking infrastructure not worth the cost yet.

Counts above are accurate as of e85e249 and grow over time as new bugs
are caught with regression cases — `tail` the test output to see the
exact `N/M passed` line.

## What's not here yet

- **Persistence beyond the log**: state is in-memory. Restart replays.
  This is by design — the log is the only durable thing.
- **Cutover from `/api/control/dispatch`**: the existing Vercel route still
  exists. Once this loop is exercised against real agents, M9 retires it
  and the daemon stops shipping pending_commands rows.

# `home/` — local Bridge + Worker (embedded in Fleet Runner)

These pure pieces tail one append-only JSONL event log on the user's machine.
The standalone Brain (`server.ts`) that once served state over HTTP on :3001
was retired in `a3f470d` — Fleet Runner desktop now embeds the watcher and
owns execution. State projection (`state.ts`) is still computed from the same
log; it's just consumed in-process instead of served. What runs locally:

```
~/.${APP_SLUG}/events.jsonl     ←  every event ever, version-stamped, one per line

  ┌─────────────┐                     ┌──────────────┐
  │  watcher.ts │                     │  worker.ts   │
  │   (Bridge)  │                     │  (Consumer)  │
  ├─────────────┤                     ├──────────────┤
  │ session.md  │                     │ tails log    │
  │ changes     │                     │ filters for  │
  │ → worker.   │                     │ bridge.      │
  │   idle      │                     │   dispatch   │
  │   events    │                     │ → injects    │
  └─────────────┘                     │   via zellij │
                                      │ → worker.    │
   state.ts folds the log into        │   started    │
   per-project state, consumed        └──────────────┘
   in-process by Fleet Runner
   (formerly served by server.ts on :3001).
```

## Run

> **The executor is Fleet Runner desktop.** The standalone Brain
> (`home/server.ts`, port 3001) and its one-command `scripts/home-start.sh`
> launcher were retired in `a3f470d`. In production every dispatch goes
> cloud `/api/inject` → `pending_command` → Fleet Runner polls and types into
> zellij. The pieces below stay individually runnable only for iterating on
> one of them in isolation — there is no longer a combined launcher.

Run a single piece in its own terminal while you iterate on it. Each requires
an explicit `--start` flag — naked invocations print a usage banner and exit 0
so accidental `| tail -N` pipes don't leave orphaned watchers behind:

```bash
npx tsx home/watcher.ts --start   # Bridge — emits worker.idle when sessions change
npx tsx home/worker.ts  --start   # Consumer — injects bridge.dispatch into zellij
npx tsx home/worker.ts  --self-test   # Inline tests, no I/O
```

Override the watcher sessions dir with `APP_SESSIONS_DIR=/tmp/test-sessions`
(for testing).

## Smoke test — append a worker.started event manually

```bash
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)
mkdir -p ~/.$SLUG

cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"worker.started","project":"Demo","adapter":"claude","intent":"next_best"}
EOF

# A running `worker.ts --start` picks the event up on its next tail read.
```

## Smoke test — dispatch to the worker

The HTTP `/api/dispatch` and `/api/cancel` endpoints lived on the retired Brain
(`home/server.ts`). The worker now consumes events straight from the JSONL log,
so a local smoke test appends a `bridge.dispatch` event the same way the
`worker.started` example above does. With `npx tsx home/worker.ts --start`
running and a `Demo` zellij tab open:

```bash
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)

# Fire now: the worker injects "run the smoke test" into the Demo zellij tab
# and appends its own worker.started event.
cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"bridge.dispatch","project":"Demo","adapter":"claude","intent":"next_best","queueHead":"run the smoke test"}
EOF
```

In production this event is written by the cloud `/api/inject` handler that
Fleet Runner polls — the local append above just exercises the same consumer.
Autonomy gating (the `manual` / `confirm` / `auto` / `sleep` thresholds) now
lives in `home/decide.ts` and runs upstream of the event, not in this hop.

## Smoke test — cancel an in-flight run

```bash
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)

# Sends Ctrl+C to the project's zellij tab. runId must match the live run's
# worker.started; the eventual worker.finished is tagged user_abort.
cat <<EOF >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"bridge.cancel","project":"Demo","runId":"<live-run-id>","reason":"changed my mind"}
EOF
```

## Files

| File          | Purpose                                                                          |
|---------------|----------------------------------------------------------------------------------|
| `state.ts`    | Pure `applyEvent(state, event) → state`. Re-labels cancelled runs as `user_abort`. |
| `log.ts`      | Tail one JSONL file, parse via `@/lib/events`. Phase flag (replay/live).         |
| `emit.ts`     | Single append-only writer. Stamps `v` + `id` + `ts` at write time.               |
| `render.ts`   | Thin adapter over `@/lib/orchestration` to render full dispatch prompts.         |
| `decide.ts`   | Pure decision function: `(state, queueHead, autonomy) → action + confidence`.    |
| `projects.ts` | Reads `~/.config/agent-projects.conf` — the tab→path[→adapter] SSOT.            |
| `state.ts`    | Pure event projection — folds the JSONL log into current per-project state. (Was served over HTTP by the retired `server.ts`; now consumed by Fleet Runner.) |
| `log.ts`      | JSONL tailer — the replay path the worker uses to rebuild state on boot.          |
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
individually while iterating, all at once via the chained runner, or rely on
the pre-push hook (`.husky/pre-push`) which calls `test:home` automatically:

```bash
npm run test:home                     # all eight suites, ~14s — used by pre-push

npx tsx home/state.ts                # event projection
npx tsx home/decide.ts               # autonomy + confidence
npx tsx home/projects.ts             # agent-projects.conf parser
npx tsx home/render.ts               # every intent renders
npx tsx home/emit.ts    --self-test  # append-only writer
npx tsx home/log.ts     --self-test  # JSONL tailer (replay path)
npx tsx home/watcher.ts --self-test  # parseHandoff + tabFromFilename
npx tsx home/worker.ts  --self-test  # applyEvent pure-function path
```

Each suite prints its own `N/M passed` footer; `npm run test:home`
aggregates them into a total. Counts grow as regression cases are
added — don't hardcode them anywhere.

`state.ts`, `decide.ts`, `render.ts`, `projects.ts`, `log.ts`, `emit.ts`,
`watcher.ts`, and `worker.ts` each ship inline self-tests aggregated by
`npm run test:home`. The HTTP serving that `server.ts` used to do is gone;
Fleet Runner's own runtime (`desktop/`) now owns that surface and is tested
there.

## What's not here yet

- **Persistence beyond the log**: state is in-memory. Restart replays.
  This is by design — the log is the only durable thing.
- **Cutover from `/api/control/dispatch`**: the existing hosted API route still
  exists. Once this loop is exercised against real agents, M9 retires it
  and the daemon stops shipping pending_commands rows.

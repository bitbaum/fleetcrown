# `home/` — local Bridge + pure runtime pieces (embedded in Fleet Runner)

These pure pieces tail one append-only JSONL event log on the user's machine.
The standalone Brain (`server.ts`) that once served state over HTTP on :3001
was retired in `a3f470d`, and the worker (`worker.ts`) that typed prompts into
a zellij tab was deleted on 2026-09-11 with Fleet Runner 0.8.19 — the runner
now spawns every agent in a PTY it owns (node-pty) and writes prompts there
directly. State projection (`state.ts`) is still computed from the same log;
it's consumed in-process. What runs locally:

```
~/.${APP_SLUG}/events.jsonl     ←  every event ever, version-stamped, one per line

  ┌─────────────┐                     ┌────────────────────────┐
  │  watcher.ts │                     │  Fleet Runner (desktop/)│
  │   (Bridge)  │                     │  owns the agent PTYs    │
  ├─────────────┤                     ├────────────────────────┤
  │ session.md  │                     │ claims pending_commands │
  │ changes     │                     │ → spawns / writes into  │
  │ → worker.   │                     │   the owned node-pty    │
  │   idle      │                     │ → emits worker.started  │
  │   events    │                     │   / crashed / finished  │
  └─────────────┘                     └────────────────────────┘

   state.ts folds the log into per-project state, consumed in-process
   by Fleet Runner (formerly served by server.ts on :3001).
```

## Run

> **The executor is Fleet Runner.** In production every dispatch goes
> cloud `/api/inject` → `pickDispatchChannel` (locus lock → "Runs on" →
> cloud floor) → `pending_command` → the chosen runner (box runner or desktop
> Fleet Runner) claims it and writes into a PTY it owns. Nothing in `home/`
> executes anything; the pieces below stay individually runnable only for
> iterating on one of them in isolation.

Run a single piece in its own terminal while you iterate on it. Each requires
an explicit `--start` flag — naked invocations print a usage banner and exit 0
so accidental `| tail -N` pipes don't leave orphaned watchers behind:

```bash
npx tsx home/watcher.ts --start          # Bridge — emits worker.idle when sessions change
npx tsx home/calendar-drain.ts --start   # books approved calendar events via the local gog CLI
```

Override the watcher sessions dir with `APP_SESSIONS_DIR=/tmp/test-sessions`
(for testing).

## Smoke test — append a worker.started event manually

```bash
SLUG=$(grep '^export const APP_SLUG' src/config/brand.ts | cut -d'"' -f2)
mkdir -p ~/.$SLUG

cat <<EOT >> ~/.$SLUG/events.jsonl
{"v":1,"id":"$(uuidgen)","ts":"$(date -Iseconds)","kind":"worker.started","project":"Demo","adapter":"claude","intent":"next_best"}
EOT

# Anything tailing the log (Fleet Runner's in-process projection, or
# `npx tsx home/state.ts` over a copy) folds the event into Demo's state.
```

Autonomy gating (the `manual` / `confirm` / `auto` / `sleep` thresholds) lives
in `home/decide.ts` and runs upstream of any dispatch event.

## Files

| File                | Purpose                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `state.ts`          | Pure `applyEvent(state, event) → state`. Folds the JSONL log into per-project state; re-labels cancelled runs as `user_abort`. |
| `log.ts`            | Tail one JSONL file, parse via `@/lib/events`. Phase flag (replay/live).                                   |
| `emit.ts`           | Single append-only writer. Stamps `v` + `id` + `ts` at write time.                                         |
| `render.ts`         | Thin adapter over `@/lib/orchestration` to render full dispatch prompts.                                   |
| `decide.ts`         | Pure decision function: `(state, queueHead, autonomy) → action + confidence`.                              |
| `projects.ts`       | Reads `~/.config/agent-projects.conf` — the tab→path[→adapter] SSOT.                                       |
| `watcher.ts`        | M3 Bridge. Watches `~/.fleetcrown/sessions/*.md`, emits `worker.idle`. Filters to registered projects only. |
| `calendar-drain.ts` | Local half of calendar booking: drains approved-but-unbooked events from the cloud and books them via `gog`. |

## Idempotency

The log is the only durable thing. Fleet Runner replays it on boot to rebuild
per-project state; processing the same event twice is safe by construction
(`applyEvent` is pure and events carry stable ids).

## Inline self-tests

Every module in `home/` ships with an inline test suite — no separate test
runner, no framework, no external deps. Each suite runs in <1s. Run them
individually while iterating, all at once via the chained runner, or rely on
the pre-push hook (`.husky/pre-push`) which calls `test:home` automatically:

```bash
pnpm run test:home                   # all 11 suites (130 tests) — used by pre-push

npx tsx home/state.ts                # event projection
npx tsx home/decide.ts               # autonomy + confidence
npx tsx home/projects.ts             # agent-projects.conf parser
npx tsx home/render.ts               # every intent renders
npx tsx home/emit.ts    --self-test  # append-only writer
npx tsx home/log.ts     --self-test  # JSONL tailer (replay path)
npx tsx home/watcher.ts --self-test  # parseHandoff + tabFromFilename
npx tsx home/calendar-drain.ts --self-test
```

`scripts/test-home.sh` also runs three suites that live under `src/lib/`
(`actions/extract-proposal`, `actions/checkin-proposal`,
`dispatch-operator-context-format`) because they share the same
no-framework convention. Each suite prints its own `N/M passed` footer;
`pnpm run test:home` aggregates them into a total. Counts grow as regression
cases are added — the 11 / 130 figure above is the 2026-09-11 count, not a
contract.

The HTTP serving that `server.ts` used to do is gone; Fleet Runner's own
runtime (`desktop/`) owns execution and is tested there.

## What's not here

- **Persistence beyond the log**: state is in-memory. Restart replays.
  This is by design — the log is the only durable thing.
- **Execution**: nothing in `home/` starts, types into, or stops an agent.
  That is the runner's job (`desktop/src/main/pty-runtime.ts`, shared with the
  headless box runner).

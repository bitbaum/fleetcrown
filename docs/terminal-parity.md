# Terminal parity & usability

**Status:** server terminal FIXED (deployed); machine-terminal interactive parity PLANNED.

George's complaint (2026-06-18): the in-app terminal is "abysmal — I cannot easily type
commands there, it's slow and awful, and there's no parity between the server and machine
terminals."

## What was actually wrong

### Server terminal ("This server") — FIXED
`src/components/control/WorkspaceTerminal.tsx` sent **every keystroke as its own concurrent
`fetch`** to `POST /api/workspaces/[id]` with no ordering. Under normal typing the POSTs
**raced**, so the PTY received bytes out of order — typing `echo parity-test` rendered as
scrambled garbage. Confirmed live in the browser.

**Fix (shipped):** buffer input and drain it through a single in-flight POST chain — order
preserved, bursts coalesced into fewer requests (also cuts echo latency). Benefits both the
Terminal page and the control-panel agent terminals (both render `WorkspaceTerminal`).

Remaining server-terminal polish (not yet done, low risk):
- Debounce the resize POST (only when cols/rows actually change).
- Verify the prod reverse proxy (Caddy) doesn't buffer SSE — `X-Accel-Buffering: no` is set
  in the stream route; confirm it survives the proxy. SSE flush is the biggest latency lever.
- (Bigger, later) move server PTY I/O to a WebSocket so keystrokes + output share one
  bidirectional, header-light channel instead of POST-per-key + SSE.

### Machine terminal ("My machine") — NO PARITY (planned)
This is **not a terminal** — it's a read-only **peek** (`TerminalView` with
`disableStdin: true`) plus a single-line "Send a line" box. So:
- You can't type interactively (no char-level input, no Ctrl-C/Tab/arrows).
- Input goes the slow path: a whole line → `pending_commands` → runner 2s poll (seconds of
  latency), with the prompt-submit CR semantics, not raw keystrokes.
- No resize channel to the remote PTY.

**Why the gap exists:** the server PTY lives in the web process (symmetric local I/O); the
machine PTY lives on the Fleet Runner (another machine), so only *output* was wired (peek
streams real PTY bytes via `executor.subscribe` → `peek-frame` → `peek-stream` SSE).

## Plan for machine-terminal interactive parity

The hard half (live output byte stream) already works. What's missing is a **fast raw-key
input channel** to the runner's `executor.write` (the primitive `injectPty` already uses):

1. **Raw-key endpoint** `POST /api/control/tab-inject-raw` (or `tab-inject` + `raw:true`):
   when `isRuntimeAvailable()` (UI on the same box as the runner) write bytes directly to
   `executor.write(workspaceId, bytes)` — **no prompt-state file, no 250/800ms CR hack**
   (those are prompt semantics, wrong for char input).
2. **Fast cloud→runner keystroke transport** (the one real decision): per-keystroke must NOT
   go through `pending_commands` (per-key DB rows = catastrophic). Options:
   - reuse the bridge `NOTIFY`/`sseBus` plumbing (`desktop/src/main/bridge-subscriber.ts`,
     `src/lib/sse-bus.ts`) for a non-durable raw-key fast lane, or
   - a dedicated runner ingress SSE/long-poll for keystrokes.
3. **Resize channel** to the runner PTY (mirror the server's `resize` action).
4. **Flip the machine xterm interactive** (`disableStdin:false`, wire `onData` to the raw-key
   endpoint).

## Consolidation (organic-growth cruft — overlaps Thread B)

- **Two xterm wrappers** diverged only because one assumed read-only:
  `src/components/control/WorkspaceTerminal.tsx` (interactive) and the machine-side
  `TerminalView`. After parity they should **merge into one** component parameterized by its
  input/output transport — the SSOT the `TerminalSurface` doc-comment already promises
  ("same xterm view, two substrates") but the code doesn't deliver.
- `PeekTabDrawer` (one-shot zellij dump-screen snapshot) is largely superseded by live PTY
  streaming — candidate for removal.
- `ZellijLivePanel` / `ZellijLiveRows` on Control overlap the "My machine" terminal — audit
  for retirement once the unified terminal lands.

## Relationship to Loki

Interactive terminal parity serves **power users** who want raw shell control. For everyday
low-cognitive-load use, `docs/loki-command-surface.md` (the conversational composer) is the
higher-level answer. Both coexist; invest in terminal parity for the workbench, Loki for the
front door.

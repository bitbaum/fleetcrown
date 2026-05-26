# Agent CLI Registry Spec (SSOT)

**Date**: 2026-05-26
**Status**: Draft — Phase 1 of multi-agent agnosticism work
**Goal**: Make adding a new CLI agent (grok, claude, codex, gemini, cursor, future) a small, obvious change. UI and daemon must accurately reflect reality in the user's zellij tabs with zero manual terminal work for installation.

## First Principles (from CLAUDE.md + this project)

1. **SSOT**: One place defines everything needed about an agent CLI. Everything else derives or consumes it.
2. **SoC**: Web UI only cares about "which agents are available and what actions they support". Daemon only cares about "how do I detect/launch/quit/inject for this agent". Prompt rendering only cares about "what handoff instructions to give".
3. **DRY + Design for Change**: Adding a new agent should touch 1-3 files max, not 10+.
4. **User Reality > Internal Purity**: The system must reflect what is *actually running* in the user's terminal (process scan + zellij tabs + declared adapter in conf) more than what the web DB thinks.
5. **Zero Terminal Friction for Normal Users**: A user with zero CLIs should be able to click in the web UI and have the correct installer command injected into a terminal tab they can follow.

## Canonical Agent Definition (Minimal Viable Data)

Every supported agent must define (in one source):

```ts
interface AgentDefinition {
  id: string;                    // "grok", "claude", "codex", "gemini", "cursor", ...
  label: string;                 // "Grok", "Claude Code", ...

  // Detection
  processMatchers: string[];     // Basenames to look for in /proc (e.g. ["grok"], ["claude"], ["agent"] for cursor with path check)

  // Lifecycle
  launchCommand: (dir: string, model?: string) => string;  // What to type to start it in a dir
  quitCommand: string;           // What to send to gracefully exit ("/exit", "q", etc.)

  // Installation (the key for "zero CLIs" users)
  installCommand: string;        // The exact command to run in terminal for first-time install
  installDocsUrl?: string;

  // Handoff / State
  sessionDir?: string;           // Only if the agent has its own persistent session dir we must respect (e.g. "~/.grok/sessions"). Most can use the Cockpit handoff convention.
  usesCockpitHandoff: boolean;   // Almost always true for interactive TUIs

  // UI / Capabilities (drives buttons, labels, flows)
  capabilities: {
    tabSwitching: boolean;           // Can we switch into/out of a running session?
    supportsClearContext: boolean;   // Does /clear or equivalent make sense?
    isInteractiveTUI: boolean;       // Long-running REPL-style vs one-shot?
    hasNativeSessionPersistence: boolean;
  };

  // Optional
  defaultModel?: string;
  modelSuggestions?: string[];
  notes?: string;                    // "Requires browser login during install"
}
```

**Derived / Consumed**:
- `listAgentRegistry()` in TS returns this shape.
- Bash daemon reads a generated or mirrored small fragment (or calls into a small helper) for scan/launch/quit.
- UI (ControlPanel, switcher, DaemonStatusBanner, project cards) is 100% driven by this.
- "Install" flow uses `installCommand`.
- Handoff path logic uses `sessionDir` (fallback to standard Cockpit handoff).

## Current Hardcoded Places (Audit Snapshot 2026-05-26)

**High duplication / risk areas** (must be eliminated or made obvious consumers of the SSOT):

1. `src/lib/agent-registry.ts` — closest to SSOT today, but missing `installCommand`, `sessionDir`, full grok, and some capabilities.
2. `scripts/cockpit-daemon.sh`:
   - `_scan_agents()` case
   - `_agent_launch_cmd()`
   - `_agent_quit_cmd()`
   - Fallback strings for `~/.claude/sessions`
3. `scripts/agent-hook-lib.sh`:
   - `_session_dir()`
   - `agent_command()` in bridge (dupe of launch)
4. `scripts/agent-hook-bridge.sh`:
   - Same launch/quit logic again
5. `src/app/api/agent/launch/route.ts` — `AGENT_BASENAMES`
6. `src/app/api/agent/launch/route.ts` + `src/lib/agent-runtime.ts` — launch logic (partial duplication with daemon)
7. Multiple orchestration routes (`/api/orchestration/run`, inject, etc.) — claude vs codex/gemini vs openclaw branches
8. UI components:
   - `project-intent-panel.tsx` (clear context only for claude/grok)
   - `ControlPanel.tsx`, `ProjectStatusChips.tsx`, `DaemonStatusBanner.tsx` (hardcoded lists + labels)
9. `home/watcher.ts` — still hardcodes `~/.claude/sessions`
10. Comments/docs everywhere assuming claude.

## Decision: SSOT Location

**Primary SSOT**: `src/lib/agent-registry.ts` (TypeScript, strongly typed, consumed by the web app).

**Consumption strategy** (pragmatic, respects existing daemon design):
- The registry exports a `getAgentDefinitions()` that also produces a small machine-readable fragment (or we keep a tiny parallel shell table in `scripts/_agent_definitions.sh` that is *obviously* derived and has a comment "update the TS registry first").
- For the daemon (bash), we keep a small, well-commented case + functions that mirror the registry. The comment at the top says "This must stay in sync with src/lib/agent-registry.ts — the TS file is the source of truth."
- This is acceptable because the daemon must run in environments without Node.

Alternative (future): Generate the shell fragment at build/pack time for the daemon tarball.

## Next Phases (see todo list)

Phase 2 will extend the TS registry with the full canonical shape above and add grok properly.
Phase 3 will clean up the bash side.
Phase 4 will build the actual "click to install" flow using the new `installCommand`.

This spec exists so every future change can be judged against it: "Does this increase or decrease the number of places a new agent must be mentioned?"

## Success Criteria (for the whole effort)

A new engineer (or the "retard" user) can add support for a brand new CLI agent (e.g. "opencode") by:
1. Adding one entry to the registry.
2. Adding one line to the bash scan/launch table (if not generated).
3. (Optional) One small UI tweak if the agent has weird needs.

And the UI will immediately show "Install Opencode" buttons, allow switching to it, reflect when it's running in zellij, handle handoff correctly, etc.

---

*Think from ground truths. Centralize definitions. Make the common case (new user installing their first agent from the web) trivial.*
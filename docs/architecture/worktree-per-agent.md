# Worktree-per-agent dispatch isolation

**Status:** implemented, opt-in via `FLEETCROWN_WORKTREE_DISPATCH=true` on the runner.
**Module:** `src/lib/agent-execution/worktree-workspace.ts` · **wiring:** `desktop/src/main/poller.ts` (dispatch + close_tab) · **net:** `scripts/test/worktree-workspace.ts` (14 checks).

## The incident this kills

2026-07-17: an autopilot mid-run executed `git add -A` in a project's primary
checkout while a second agent had a feature branch checked out there. The
autopilot's commit swallowed the other agent's files *and* landed on the wrong
branch — two agents were sharing one worktree/index/HEAD. Prompt-level rules
("only stage your files") cannot survive `add -A`; only filesystem isolation can.

## How it works

```
dispatch(tab, dir, runId)                       primary checkout: <dir>
   └─ fresh launch only (never inject-into-live)
        ├─ pruneWorktrees(tab, dir)             sweep clean leftovers
        ├─ ensureWorktreeWorkspace(...)         ~/.fleetcrown/worktrees/<tab>/<runId>
        │     git worktree add -B fc/<runId> … HEAD
        │     symlink node_modules + .env* from the primary
        └─ prompt := worktreePromptNote(runId) + prompt
                     ("you are on branch fc/<runId>; land with
                       git pull --rebase origin main && git push origin HEAD:main")
```

- **Verification follows the agent.** Transcript/auth checks
  (`waitForAgentGenerating`, `detectAuthFailure`) are cwd-keyed, so the poller
  threads the *effective* dir everywhere (`worktreeByTab` map). The session
  handoff is tab-keyed (`~/.fleetcrown/sessions/<tab>.md`), so the close loop
  (`close-from-session.ts`) is unaffected by the cwd change.
- **Graceful degradation.** Any failure (not a git repo, git missing, disk
  full) logs and launches in the primary dir — the flag can only add isolation,
  never break a dispatch. Mirrors the `FLEETCROWN_BOX_PREPARE` precedent.
- **Cleanup never destroys work.** `close_tab` prunes only *clean* worktrees:
  no uncommitted changes AND no commits unreachable from every other ref
  (pushed/merged work counts as shared). Dirty worktrees outlive their session
  and are re-swept on the next dispatch. Artifact symlinks we created are
  disregarded when judging cleanliness.

## Semantics preserved

The loop's autonomous commit-to-main model is unchanged: the agent still lands
its work on `origin/main` (rebase-first push from its branch), the handoff still
carries the commit SHA, and `isProjectBusy` still serializes same-project
dispatches. What changed is only *where the agent's index lives*.

## Deliberate phase-1 limits

1. **Opt-in flag, default off** — safe rollout; flip the env after dogfooding.
2. **Same-project parallelism not yet lifted.** `isProjectBusy` still queues
   (`queuedBehind`) — worktrees remove the shared-checkout *reason* for that
   gate, so lifting it (distinct tabs per run) is the natural phase 2.
3. **Box runner:** `FLEETCROWN_BOX_PREPARE` resolves its clone first; combining
   both flags worktrees the box clone only when the box dir exists locally —
   fine, but the flag targets the laptop runner first.
4. **`switch_agent` / manual `launch_agent` stay on the primary** — isolation is
   for dispatched runs, not the human's own session.
5. **Desktop runner needs a release** to pick up the poller change; the box
   runner gets it on the next deploy from main.

# REVIEW.md — fleetcrown review bar

Judge the DIFF against these gates, in order. Flag correctness and requirement
gaps only — lint owns style. Global standards load via CLAUDE.md; this file is
ONLY fleetcrown's scars.

## Fatal invariants (one violation = block)

1. **API envelope is `{ok: true|false}`** — NOT the global `{success, data}`
   convention. This repo deliberately overrides it (see CLAUDE.md).
2. **Dispatch/orchestration state has ONE owner** — no new `/tmp` signal files,
   no new `claude-*` compat paths, no second writer to dispatch status. The
   split-authority loop is the repo's #1 historical bug source (13 of 15 recent
   commits were dispatch reliability fixes). Regression net: `scripts/test/`
   dispatch tests — extend, never bypass.
3. **Design system** — only `ui-*` component classes + tokens from globals.css;
   no arbitrary hex/radius/shadow. Check `check:design` passes.
4. **Runner protocol changes need a runner RELEASE** — publishing goes through
   the `fleetcrown-releases` feed (NOT `fleetcrown`); a protocol change without
   a release strands every installed runner.

## Repo gotchas that have bitten before

- Tailwind v4 silently drops an entire `@layer components` block if any rule
  uses a responsive variant inside `@apply` (e.g. `sm:p-6`) — no error. If
  component classes vanish, check this first.
- bashrc zellij auto-attach can hijack a runner-owned PTY — guard with
  `$BASH_EXECUTION_STRING` (already in dotfiles; don't regress it).

## Process gates

- `npm run test:unit` green (auto-discovers `scripts/test/*.ts`); CI green on PR.
- Diff updates CLAUDE.md/docs if it changes documented structure/behavior.
- Second fix of the same bug class ships the rule/test that ends the class.

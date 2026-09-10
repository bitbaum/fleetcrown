# FleetCrown cold start and feedback loop — Claude Code handoff

Status: IN PROGRESS. Written 2026-09-10 during Codex implementation; no commit, PR, deploy, or completed end-to-end acceptance yet. Read git diff for actual current changes. Do not treat this document as completion evidence.

## User intent and authorization

Cato wants independent FleetCrown: brief → real GitHub repo → automatically deployed website → site feedback → Implement → visible deployed change → Check live → operator Resolve → Done. Eligible studio must not need manual SSH/bootstrap/key hunting for each project. OrangeCat integration is optional and is not publication consent. No guessed terminal tab names as project identity. User authorized engineering/UX team work, fixes, PR/normal auto-merge/deploy, and production walk. Preserve unrelated existing work. Public name: Cato only. User specifically requested this handoff before context runs out.

## Workspace and instructions

Implementation worktree: `/home/g/dev/fleetcrown-wt/cold-start-loop`
Branch: `codex/cold-start-loop`, based on origin/main `27626d03405544ec81927b326f587e058ba0b0c1`.
Original `/home/g/dev/fleetcrown` is dirty and on another branch, ahead 1 / behind 38 at start. Do not reset or switch it. It has unrelated AGENTS.md/apps.conf edits.
Read `/home/g/dev/AGENTS.md`, worktree AGENTS.md and CLAUDE.md.
Fleet local checkout is stale and has NO working-tree AGENTS.md. Fetched current source is available via:
`git -C /home/g/dev/fleet show origin/main:AGENTS.md`
and `registers/org.json`, `registers/toolchain.json`, `STACK.md` at origin/main (957d2bf when fetched).
Fleet rule: one fact producer. Serve register is `scripts/hetzner/apps.conf`; org/tool names from fleet registers. Normal shipment is green PR → auto-merge sweep → CI → Deploy → live verification.
Dependencies: worktree node_modules was linked to `/home/g/dev/fleetcrown/node_modules`; another agent reported pnpm dependency resolution from cache. Check actual symlink before installing.

## Verified live facts

- `https://fleetcrown.orangecat.ch/api/health`: HTTP success, commit 27626d03405544ec81927b326f587e058ba0b0c1, env healthy, runtime false (this does not mean box runner down).
- `https://dogfood-site-sep10-1201.orangecat.ch`: HTTP 200.
- Latest three dogfood Deploy runs FAILED: 34470520431, 34470124637, 34470092040 (`catomean/dogfood-site-sep10-1201`). Thus site exists but repeatable CD unproven.
- Production units are `fleetcrown-app.service` and `fleetcrown-box-runner.service`, both active. Not `fleetcrown`/`fleetcrown-runner`.
- Box runner user ubuntu, WorkingDirectory `/opt/fleetcrown/runner`, ExecStart `/opt/fleetcrown/runner/node_modules/.bin/tsx scripts/box-runner.ts`. Recent journal says connected.
- SSH works as `ubuntu@167.233.22.31` with escalation/network approval.
- IMPORTANT actual host discrepancy: `/opt/fleetcrown/shared` DOES NOT EXIST. `systemctl show fleetcrown-app --property=EnvironmentFiles` says `/opt/fleetcrown/app/.env`; this file exists, mode 600, owner ubuntu. Do not trust generic shared-env rule over observed service configuration. Do not print secrets. No env migration performed.

## Root causes found

1. registerProjectSiteCd always passed --no-deploy, then persisted liveUrl merely because registration script exited 0.
2. Registration swallowed secret upload/first deployment failures.
3. New apps.conf row only existed in durable local checkout, but GHA downloaded GitHub manifest, so fresh slug wasn't registered from GHA's perspective.
4. Package-manager mismatch: reusable GHA selected npm, deploy.sh hardcoded pnpm.
5. Generated Next starter had no output:standalone and no lockfile; deployment requires both coherent install and standalone artifacts.
6. Fresh project starter omitted scoped feedback widget.
7. Implement and kickoff resolved user_projects by mutable display name. Batch Implement treated HTTP 200 refusal/no runId as dispatched.
8. Offline dispatch could fork untracked Hermes work regardless of project agentPref.
9. README/CLAUDE/marketing still described merged product positioning, tab focus and older execution assumptions.

## Changes currently in working tree (not shipped)

### CD engineering (agent cold_start owns)

Files: `.github/workflows/selfhost-deploy.yml`, `scripts/hetzner/register-site.sh`, `scripts/hetzner/deploy.sh`, `src/lib/site-cd-register.ts`, register-cd route, targeted tests as added.
Implemented/proposed contract: registration strict setup then workflow dispatch; GET reports pending/failed/live; liveUrl only after successful Deploy matching current repo main SHA plus public HTTP probe. GHA fetches SAME canonical durable box `scripts/hetzner/apps.conf` for unknown slug, validates registered checkout git remote matches caller, avoiding a second manifest or automatic FC-main commits.
Review agent flagged: API failures must not masquerade as perpetual pending; no workflow run must not say running; process timeout may leave descendants holding flock; accept exact public HTTP 200. Cold_start is addressing these—inspect diff, don't assume finished.
Automatic persistence still depends on GET polling. Need durable reconciliation or reliable project-open recheck when browser closes during deploy.

### Feedback engineering (agent feedback_loop finished implementation)

New `src/lib/inject-project.ts` stable entity projectId lookup. Changes to inject-core, projects/[id]/dispatch, feedback/[id]/dispatch, batch feedback dispatch, db query site-feedback and agent-sessions.
- Stable ID dispatch; no name fallback when explicit id doesn't resolve.
- Actual registered user_projects required; selected agent preserved.
- Claude session lookup by entity project id.
- Disable untracked hosted/Hermes fallback specifically for these product actions; offline chosen runner is honestly queued.
- Batch status only advances for accepted tracked run.
- Fix prompts explicitly require normal shipping and visible live evidence; Resolve remains human.
Tests added in scripts/test/feedback-work-phase.ts. Targeted tests+lint pass; agent full tsc passed (session80162 exit0).
Remaining P2: runner transport still internally uses canonical project name/projectKey; local runtime path still has Zellij gating if no PTY. Stable API boundary is fixed, whole transport migration not done.

### UX/docs (agent ux_truth)

AGENTS.md, CLAUDE.md, README.md, docs/development/cloud-local-workflows.md, marketing-content.ts, ProjectStatusChips.tsx, ProjectKickoff.tsx.
Removed focus-tab; project terminal link remains. Kickoff shows deployment separately and polls GET every 10s for bounded 15min; accepted dispatch says queued, not agent working. Docs distinguish independent products and eligible-only shared cloud execution.
Follow-up assigned: reopen/retry gap—project detail with repo but no live URL should recheck deployment; Register site header must support same pending state without duplicate truth. Agent may still be editing.
Targeted ESLint passed; kickoff tests 69/69. No production visual verification.

### Starter/provisioning (root, unfinished integration)

`src/lib/project-templates.ts`: Next starter output standalone, Next 16.3.4, pnpm@11.25.0 declaration, type-check instead of removed next lint; JSON-safe NAME_JSON/DESCRIPTION_JSON placeholders in generated TSX/metadata, slug JSON for package name, single-pass interpolation avoids recursive user placeholder substitution.
`src/lib/github-provision.ts`: optional feedback {token,appUrl}, inserts next/script widget in root layout during template seeding.
`src/app/api/projects/[id]/provision/route.ts`: creates scoped widget token with predicted site origin before repo seed, passes public token/snippet to seed. Does not write liveUrl.
CRITICAL STILL OPEN: starter declares pnpm but has NO lockfile; reviewer confirmed first GHA install still fails. Generate real pinned starter pnpm-lock and include via maintainable template asset, OR implement coherent first-install path which generates/persists lockfile as normal provisioning. Do not fake lockfile or bypass frozen installs silently. Update light template labels/config (still Next15/npm) and relevant firstTask/docs to match chosen starter. Existing project templates for other stacks should remain supported honestly.
Also route currently returns success when templateSeeded=false; consider recoverable retry rather than claiming deployable repo. Existing gitUrl guard returns409 on retry; avoid creating duplicate repo/overwriting user files.
Widget default only wired for existing-project provision, not separate create-with-github route yet. Primary brief-only kickoff uses provision route.

## Validation so far

- Root tsc redirected to `/tmp/fc-cold-typecheck.log`; empty at last check. Session66420 was still potentially open; poll if necessary.
- Feedback agent full tsc completed exit0.
- Targeted feedback and kickoff tests pass.
- No canonical `pnpm run verify` full run yet. Must run; it includes formatting, deploy/client/telegram gates, tsc, lint, design, desktop, unit/home/ops. See package.json source.
- No complete new-slug production cold start or feedback change yet. Do not report done based on dogfood200.

## Production test preparation (unfinished)

Temp `/tmp/fc-mint-session.mjs` reads default studio owner from production DB and mints short-lived Auth.js JWT, writing ONLY token to stdout intended redirected `/tmp/fc-cold-session` chmod600.
Attempts failed: generic shared env absent; then imports `/opt/fleetcrown/app/node_modules/postgres/src/index.js` not present in standalone output. `/tmp/fc-cold-session` therefore currently empty, NOT a usable session.
Next: locate usable package imports in `/opt/fleetcrown/runner/node_modules` or durable `/home/ubuntu/dev/fleetcrown/node_modules`, or use supported dogfood auth script with secure runtime env. Never print auth token, database URL or secrets. Could mint using local installed auth library + read-only SSH DB user query with secret captured privately, but keep credentials out of logs.
Use Playwright with private session cookie to walk actual UI once fixes deployed; test mobile/desktop critical path. Browser/API implementation APIs already exist; inspect before automating.

## Exact next actions

1. Collect agents' outstanding CD and UX follow-up results; inspect all diff together, especially state/polling contract and source-of-truth manifest behavior.
2. Finish starter lockfile/install coherence, truthful seed failure recovery, widget integration regression tests. Verify template actually builds standalone from emitted files with difficult quoted brief/name strings.
3. Run full verify and appropriate production build. Fix actual failures, distinguish pre-existing issues without weakening gates.
4. Commit focused work, create ready PR only when deployable, let normal auto-merge/CI/Deploy run. Verify new production health commit. Update durable box scripts via normal deploy mechanism; ensure registration invokes updated script rather than stale durable checkout implementation (critical path to inspect).
5. New unique slug via FleetCrown UI: brief → Make it happen → repo, automatic CD, HTTP200 and persisted liveUrl with no manual per-site register/bootstrap. Ensure content fulfills brief, not only generic starter.
6. From site widget file a deterministic visible change; Implement with project agent; observe actual code/ship/live; Check live → Resolve → Done. Do not substitute root manual edit for product Implement proof.
7. Update this handoff and concise user status with PRs, commits, URLs and evidence/remaining gaps.

---

## Continuation (Claude Code, 2026-09-10, after Codex ran out of budget)

Lineage: Grok wrote the product handoff (FleetCrown-first entry path, OrangeCat →
FleetCrown as optional link that is not publication consent, two profiles that
stay separate products, acceptance one-liner: brief → real repo → live website
with zero box babysitting → change it through feedback/Implement → live site
updates, no tab-name fiction). Codex investigated and left the working tree
above. This section records what was finished from that tree and how it was
proven. Evidence, not intent.

### Finished from the "exact next actions" list

1. **Starter lockfile (the P0 blocker).** The nextjs-tailwind starter declared
   `pnpm@11.25.0` but shipped no lockfile; `selfhost-deploy.yml` refuses to
   install without one and installs with `--frozen-lockfile`, so every first
   Deploy of a fresh starter failed before building. The lock is now resolved
   once by `scripts/templates/refresh-starter-lock.ts` into
   `src/lib/starter-locks/nextjs-tailwind.generated.ts` and seeded as
   `pnpm-lock.yaml` with the other starter files (one GitHub API tree call, no
   pnpm or network on the app box). `scripts/test/starter-lock.ts` fails when
   the starter's package.json and the lock drift, when standalone output or the
   packageManager declaration go missing, or when starter docs tell the agent
   to use npm against a pnpm lock. Proof: the rendered starter (with a project
   name containing quotes, backticks and `${}`) passed
   `pnpm install --frozen-lockfile`, `tsc --noEmit`, and `next build` with
   `.next/standalone` present, locally on 2026-09-10.
2. **Deployment status race.** The first GET after a workflow dispatch ran
   before GitHub materialised the run; with a `head_sha`-filtered list that
   read as "no deployment exists" and polling stopped on a false failure.
   `describeSiteDeployment` (pure, tested in `scripts/test/site-cd.ts`) now
   treats any queued/in-progress run, or a just-sent dispatch, as "starting".
   A missing deploy workflow names its own fix. The client hook surfaces a
   status it cannot read as a failure with the server's error instead of
   silently stopping.
3. **Seed failure is honest and recoverable.** Kickoff stops (no CD
   registration, no dispatch) when the repo was created bare. Provision on an
   already-linked repo re-seeds it when main has no `package.json` instead of
   refusing with 409; otherwise 409 as before.
4. Starter labels/docs match the starter: Next.js 16, pnpm, standalone.

### Still open after this continuation

- Runner transport still carries the canonical project name internally
  (`projectKey`); the API boundary is id-first, the transport migration is not.
- Focus-tab remnants remain in `ZellijLivePanel`, `WorkspaceTerminalClient`,
  `ControlPanel` (P2 in Grok's list). Control's project chips no longer offer it.
- The scheduled `Audit` workflow has been red on main since 2026-09-07. It is
  not the auto-merge gate (`ci.yml` is) and was not investigated here.
- Widget embed at seed time is wired only for `/provision` (the kickoff path),
  not `/create-with-github`.

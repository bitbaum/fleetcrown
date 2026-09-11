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

### Walk A on production (2026-09-10, after #569 deployed as f25958dc)

Project `velokiosk-sep10` (https://fleetcrown.orangecat.ch/projects/17b76f42-a8a5-49e9-b662-341b5181ac5f),
brief only, through the same routes the kickoff UI calls. Profile (11 fields),
roadmap (5 milestones) and repo (`catomean/velokiosk-sep10`, starter seeded
with lockfile) all landed. Then four defects, none of them in the PR above:

1. **No deploy workflow in the repo.** The GitHub OAuth grant is
   `read:user user:email repo`; GitHub refuses to create `.github/workflows/*`
   without `workflow`. Both the Contents API seed and register-site.sh's push
   were refused, and the script said "remote may already have the shim" and
   carried on. Fix: request `workflow` (new sign-ins), and register-site.sh
   falls back to the host's own gh login for the shim, then verifies the file
   is on the remote and fails if it is not.
2. **register-site.sh cannot SSH to its own box.** `box()` named no identity;
   ubuntu's only key is the CI deploy key. Fix: `box()` uses `DEPLOY_KEY_PATH`
   when readable.
3. **Port 4024 allocated twice.** The durable register on the box was three
   commits behind main; main had given 4024 to diplodoctor, which was listening
   on it. Fix: allocate and conflict-check against both the durable register
   and the release copy beside the script; fast-forward the durable checkout
   when all its rows are on main; send each new row to main as a PR
   (`register/<slug>`) so the register has one home again.
4. **Kickoff dispatch ran on the wrong builder.** The project's dirPath is
   `/home/ubuntu/dev/velokiosk-sep10` (box clone root), but a Fleet Runner on
   the operator's laptop was connected, so "operator present" routed the job
   there; that runner does not clone on demand, launched claude in a directory
   that does not exist, and reported "inject did not stick" three times. Fix:
   `projectChannelLock` returns `cloud` for a dirPath under
   `FLEETCROWN_BOX_DEV_ROOT` (explicit env only).

Also seen while reproducing on the box: Claude Code shows a workspace-trust
dialog for a fresh directory. `ensureClaudeReady` already pre-trusts it on the
box path; it never ran because the job never reached the box.

Open after this: the desktop runner should refuse (or release) a claim whose
directory does not exist locally — defensive, in the desktop bundle, not
shipped here.

### Walk A: result (2026-09-10, late evening)

`velokiosk-sep10` is live at https://velokiosk-sep10.orangecat.ch (HTTP 200) with
the page the kickoff agent built to the brief: title, Mon–Fri 07:00–19:00,
three fixed prices (CHF 25 / 35 / 120), about, contact email, one accent
token, and the project-scoped feedback embed. FleetCrown's own status for the
project reads `deploymentStatus: live`, `liveUrl` persisted, release
`20260910-233620-a4c5393` on port 4028, unit active.

What the product did by itself, in order, after #569 / #585 / #589 / #592:
project + profile (11 fields) + roadmap (5 milestones) + seeded repo with
lockfile; kickoff dispatched to the box (cloud lock), agent built the page,
opened PR #1 on the site repo; registration allocated 4028 against both
registers, sent the row to main (#588, merged by the sweep), wrote the shim
through the host gh login, set the deploy secret, wrote the runtime env, the
unit and the Caddy vhost, and installed the watchdog via sudo. The push of the
shim started the site's first Deploy on its own.

What still needed a hand, and why:
- The site repo's PR #1 (agent's landing page) was merged by the operator's
  gh: a fresh starter has no CI and no auto-merge, so an agent PR waits for a
  human. Either the starter ships a ci.yml + auto-merge, or the kickoff agent
  pushes to main for a brand-new solo site. Decide once; today it is a click.
- The first successful site Deploy was dispatched by the operator (gh) while
  the last registration defect (#596, watchdog `remote` quoting) was still in
  flight; the product's own dispatch is the same workflow, the button was the
  only difference. Re-registration after #596 is the clean proof (see below).
- Three earlier Deploys of the site failed: two before the runtime env existed
  (env was written after sync-infra, now before the shim), one before the shim
  reached the remote.

Fleet-level findings, not fixed here:
- Sibling sessions merged to main every few minutes; each merge cancels the
  previous CI run on main (per-ref concurrency), so nothing deployed for ~25
  minutes at a time. The sweep re-arming CI on every merge amplifies this.
- The durable register on the box never fast-forwards: its rows differ from
  main by plan/price edits made on main, so "unpublished rows" is always true.
  Allocation reads both registers, so it is safe, but the checkout is stale
  forever. A rule keyed on slug, not the full row, would let it follow main.

### Walk B: result (2026-09-11, 00:06 UTC)

Feedback filed through the site's own widget ingest (visitor, token-scoped
to https://velokiosk-sep10.orangecat.ch): "add 'Sat–Sun closed' after the
Mon–Fri hours". Row `d4f5c5dc` in the project inbox. Implement dispatched at
23:38:33; the box agent committed the fix through the page's `OPENING_HOURS`
config at 23:40:29, opened PR #2 with the verbatim feedback and a test plan,
wrote its handoff at 23:41:07, and explicitly left the merge to the operator.
Operator merged PR #2 (00:05); the push deployed `293adce`
(`20260911-000520-293adce`, HTTP 200) and the live page shows "Sat–Sun ·
closed". Check live done by the operator; feedback set to `resolved` at
00:06:28 through the product API. Done.

Under three minutes from Implement to PR. The merge is the only human step,
and it is there for the same reason as in walk A: a fresh site repo has no CI
or auto-merge, and the agent's contract forbids merging its own PR.

One discrepancy: the run record for this Implement stayed `delivered /
waiting for a completion handoff` although the watcher logged `worker.idle`
with the handoff summary at 23:41:07, while the kickoff run on the same box
did flip to `completed`. Control would show this fix as still running until
someone looks. Not fixed here; see the note below on what the DB says.

What the database says about the two runs on the box (`orchestration_runs`):

| run | intent | state | outcome | finished_at |
| --- | --- | --- | --- | --- |
| abd5469d (kickoff) | custom | done | success | 23:17:33, the second the watcher logged `worker.idle` |
| c317e8dd (feedback Implement) | custom | waiting | — | never, though `worker.idle` with its handoff was logged at 23:41:07 |

The Implement run was "injected to running claude (pty)" into the session the
kickoff had left open, where the kickoff run had been launched fresh. Start
there: the idle-to-finish attribution seems to close only a run that launched
the PTY, not one injected into an existing one.

### Status of the acceptance one-liner

Start in FleetCrown with only a brief, get a real repo and a live website
with zero box babysitting, change it through feedback/Implement, see the live
site update, no tab-name fiction on the critical path: **met for
velokiosk-sep10 on 2026-09-11**, with two operator clicks left on the path
(merging the agent's PRs on a site repo that has no CI/auto-merge yet). The
registration path itself completes end to end from inside the product on
FleetCrown 5c27d775: `registered: true`, `deploymentStatus: live`, liveUrl
persisted, register row on main by PR, monitoring seeded.

Shipped in this continuation: #569, #579 (landed as #585 by a sibling
session), #589, #592, #596; the box's own register-row PR #588.

### Still open (ranked)

1. Fresh site repos: ship a `ci.yml` + auto-merge in the starter, or have the
   kickoff agent push to main for a brand-new solo site. Today every agent PR
   waits for a human.
2. Runner: a run injected into an existing PTY never reaches `done` (table
   above). Control shows "waiting" forever for a finished Implement.
3. Desktop runner: refuse or release a claim whose directory does not exist
   locally (defensive; the routing lock already keeps box-rooted projects on
   the box).
4. Durable register on the box never fast-forwards (rows differ from main by
   plan/price edits); key the "unpublished" check on slug.
5. CI on main cancels under rapid merges (per-ref concurrency + sweep
   re-arms); deploys lag by tens of minutes while sessions merge in bursts.
6. Runner transport still keys on the project name internally (P2 from the
   Codex list); Focus-tab remnants in `ZellijLivePanel`,
   `WorkspaceTerminalClient`, `ControlPanel`.
7. Scheduled `Audit` workflow red on main since 2026-09-07 (not the gate).

### UI walk (2026-09-11, 06:16–06:30 UTC, real browser)

The earlier walks used the product's routes from curl. This one drove the
actual FleetCrown UI in a Chromium (Playwright) with the studio session, plus
the site's own feedback widget. Project `kaffeeklappe-sep11`, FleetCrown
b06fde7.

- Projects → Add: name + description → project created. It did not appear in
  the default list of 25 (found via search); a just-created project should
  surface first.
- Project page → Make it happen with a brief: "Filling the profile — 9 fields",
  "Creating the repository — catomean/kaffeeklappe-sep11", "Putting an agent
  on it — request accepted". The deployment panel showed "Deployment is
  running… Check deployment" and, on its own polling, flipped to "Site
  deployed — Open live site → https://kaffeeklappe-sep11.orangecat.ch/". Port
  4032, register row PR #606 from the box, runtime env, unit, vhost: no hand
  on the box. After a reload the page shows a Live control and the kickoff
  panel is gone.
- Control listed the project as "Ready for next step · Last run completed"
  once the kickoff agent finished; its PR #1 (the page, to the brief) was
  merged by the operator; Deploy on push; live with menu, hours and widget.
- On the live site, the widget's own form (scope, text, optional contact,
  voice, screenshots) sent a visitor report. It appeared in FleetCrown's
  Feedback inbox under "Needs you" with an Implement button. Implement →
  "Queued — starting" → "Working now". The agent's PR #2 was merged by the
  operator; the deploy put "Sonntags und an Feiertagen geschlossen" on the
  live page. Resolve in the inbox → "Shipped · Done · resolved today".

UI-only findings: (1) new project not surfaced in the list; (2) the inbox
item stayed "Working now" after the agent had finished and opened its PR —
the same run-record defect as walk B, now seen in the UI an operator would
watch; "Check live" never appeared, only Resolve; (3) the watchdog seeded its
targets from the release register, not the one just written (fixed in #607);
(4) starter has no favicon (console 404).

Still two operator merges on the path (agent PRs on a site repo with no CI or
auto-merge); everything else ran from the product.

---

## Superseded on 2026-09-11

The sections above are left as written. What follows is what changed on main
the next day (Fleet Runner 0.8.19, "one substrate"), so the open items above
are read against the current design rather than the one they were filed in.

- **Routing is a stored decision.** `pickDispatchChannel(project)`
  (`src/lib/execution-access.ts`) resolves: locus lock (a laptop-only checkout
  stays local; a checkout under the box clone root stays cloud) →
  `user_projects.builder_pref` ("Runs on" in Control → project profile) →
  cloud floor (`DEFAULT_BUILDER_CHANNEL = "cloud"`). Runner presence and
  laptop battery no longer route anything; an offline chosen builder queues
  visibly (`runnerConnected: false`) and never reroutes. Walk A defect 4
  above — "a Fleet Runner on the operator's laptop was connected, so
  'operator present' routed the job there" — is the class of bug that was
  deleted, not patched: there is no presence-based routing left to get wrong.
- **The local runtime is PTY-only.** Fleet Runner owns every agent PTY
  (node-pty). Zellij is gone from the product: no cold-start restore on boot,
  no Settings "Restoration" section, no `/api/control/runtime-state/desired`,
  no bundled zellij binary, no `FLEETCROWN_RUNNER_PTY`, no `src/lib/zellij.ts`,
  no `src/lib/terminals/*`, no `home/worker.ts`, no `src/lib/agent-runtime.ts`.
  The "local runtime path still has Zellij gating if no PTY" P2 above is
  closed: an inject for a tab with no live owned PTY fails loudly ("no running
  agent for … — dispatch to start one") and the cloud enqueues a dispatch (cold
  start) instead. `/api/control` reports owned PTYs as `liveTabs`.
- **Focus-tab is removed.** No `focus_tab` command, no
  `/api/control/focus-tab`. The "Focus-tab remnants in `ZellijLivePanel`,
  `WorkspaceTerminalClient`, `ControlPanel`" item is closed (the two Control
  components are now `LiveTerminalPanel` / `LiveTerminalRows`). `/control?focus=…`
  survives only as a client-side deep link that selects and highlights the
  project on Control.
- **Kickoff builds on arrival.** The OrangeCat "Build it with FleetCrown"
  handoff creates the project and lands on `/projects/<id>?kickoff=auto` with
  the kickoff running (profile → milestones → repository → agent); `?review=1`,
  a same-named project, or an already-connected entity show the picker/open
  instead. Linking an existing project never auto-starts; funding events never
  dispatch.

Still open from the ranked list above after this change: 1 (starter CI +
auto-merge), 2 (run injected into an existing PTY never reaches `done`), 4
(durable register never fast-forwards), 5 (CI cancels under rapid merges), the
transport half of 6 (`projectKey` inside the runner transport), 7 (scheduled
Audit workflow). Item 3 (refuse a claim whose directory does not exist locally)
is moot for routing — the lock keeps box-rooted projects on the box — and
remains a defensive nicety in the desktop bundle.

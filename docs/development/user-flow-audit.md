# User Flow Audit — FleetCrown

---
created_date: 2026-07-04
last_modified_date: 2026-07-04
last_modified_summary: QA items 3–4 done — honesty chips, setup auto sign-in, workspace gate, optional verify banner.
---

SSOT for **every user-facing flow implied by the UI**, with a working-status grade per flow. Use this for QA planning, onboarding honesty, and prioritising fixes.

**Related docs**

- [Cloud vs local workflows](./cloud-local-workflows.md) — builder vs browser; local CLI tools (`runTool`)
- [Responsive design](./responsive-design.md) — mobile shell constraints
- `scripts/smoke.sh` — automated route health (not flow completeness)
- `src/config/navigation.ts` — sidebar route SSOT

## Glossary — Ivy vs Loki (not the same rename)

| Name | What it is today | User-facing? |
|------|------------------|--------------|
| **Loki** | In-app assistant on `/loki` — OpenClaw `main` agent via `openclaw-gateway.ts` (`loki-core.ts`). Same brain as Telegram when gateway is up. | **Yes** — product name in nav, composer, Settings → Voice |
| **Ivy** | **Legacy** persona name for the OpenClaw assistant (pre–FleetCrown rebrand). Still appears in old docs, `content/thoughts` author lines, DB channel key `ivy` (UI label → "Loki" in `project-detail-types.ts`), and ops runbooks (`migrate-openclaw.sh`). | **No** in current UI — do not use in new copy |
| **OpenClaw gateway** | Infrastructure Loki talks to (WebSocket). Was sometimes called "Ivy gateway" in ops docs. | Internal |
| **`runTool` / local CLIs** | Shell-out layer (`lib/tools.ts`) for `gog calendar`, `weather.sh`, git scripts on a machine with tools installed — **not** Loki. Calendar on hosted prod returns `runtimeOnly: true` (no Google CLI on box). | N/A |

**Rule:** User-facing assistant = **Loki**. **Ivy** is historical; migrate docs/comments when touched. Calendar/weather depend on **local CLI tools** or cloud fallbacks (open-meteo for weather), not on Loki.

## QA progress tracker

| # | Initiative | Status |
|---|------------|--------|
| 1 | Flow-status matrix in this doc | [x] Done 2026-07-04 |
| 2 | Authenticated smoke + PIN on prod (`npm run test:authenticated-smoke`) | [x] 57/57 2026-07-04 |
| 3 | UI honesty labels on Control/Loki/Terminal (queued / needs builder / needs GitHub) | [x] `executor-copy.ts` + `ExecutorHonestyChip` on Control intents, Loki composer, Terminal toggle |
| 4 | Fix top “feels broken” gaps (setup→sign-in, verify-email enforcement, `/control/workspace`) | [x] Setup auto sign-in; verify-email optional banner + email copy; workspace gated on hosted |

## Checkbox legend

| Mark | Meaning |
|------|---------|
| `[x]` | **Smoke-verified** on prod 2026-07-04 — page loads or API GET returns 2xx (no error boundary) |
| `[~]` | **Partial** — grade B/C/D, queues, needs runtime, or smoke-only (not full user outcome) |
| `[ ]` | **Not verified** — no automated or manual E2E proof yet |

## How to read grades

| Grade | Meaning | “Works 100%” for the user? |
|-------|---------|----------------------------|
| **A** | UI + API + persistence complete in production with DB + auth only | Yes |
| **B** | Wired correctly; needs an external runtime (builder, OpenClaw/Loki gateway, Groq, local CLIs, Stripe, GitHub OAuth, OrangeCat OIDC, etc.) | No — queues, degrades, or blocks until dep is up |
| **C** | Partial — known gap, misleading surface, or graceful degradation | No |
| **D** | Stub, redirect-only, or explicit roadmap — UI oversells capability | No |

**“Full implied outcome”** = the user gets what the button/copy suggests without extra setup. On hosted prod (`fleetcrown.orangecat.ch`), **~37%** of mapped flows meet that bar (~75 of ~203). **~63%** need a builder, integration, or have a known gap.

## Verification (2026-07-04)

| Method | Scope | Result |
|--------|-------|--------|
| Production `scripts/smoke.sh` (unauthenticated) | 44 routes | **44/44 OK** |
| `npm run test:authenticated-smoke` (prod) | 57 probes session + PIN | **57/57 OK** |
| Unit/inline tests | auth, onboarding, execution-access, workspace-access, dispatch-gates, fleet-kick, loop-ssot, executor | all passed |
| Codebase mapping | Every `page.tsx`, shell component, `api/*/route.ts` | complete |

### Authenticated smoke (`npm run test:authenticated-smoke`)

Script: `scripts/test/authenticated-smoke.ts`. Resolves a session via (in order):

1. `FLEETCROWN_SESSION_TOKEN` (`COCKPIT_SESSION_TOKEN` legacy)
2. `SMOKE_EMAIL` + `SMOKE_PASSWORD` (credentials sign-in)
3. JWT mint with `AUTH_SECRET` + prod user row (works because Auth.js uses **JWT strategy** — the `sessions` table is empty)
4. Brave browser profile copy (`AUTH_MODE=browser`)

Optional: `SMOKE_PRIVATE_PIN` unlocks private-zone API probes (`fleetcrown-pz` cookie; reads legacy `cockpit-pz`).

Report written to `.tmp/authenticated-smoke-report.json`.

**Prod run (2026-07-04, `jwt-mint`, PIN unlocked via `SMOKE_PRIVATE_PIN`):**

| Area | Result | Implication for grades |
|------|--------|------------------------|
| All 20 authenticated pages | HTTP 200, no error boundary | Page shells **A** |
| Control/Loki/Terminal/Projects APIs | 200 | Read paths **A** |
| Private-zone APIs (`/api/goals`, `people`, `habits`, `events`) | **200** with PIN | CRUD flows **A** when unlocked |
| Private-zone APIs without PIN | **403** | Expected gate — not broken |
| `/api/workspaces` | **403** (hosted gate) | Workspace flow stays **C** |
| `/api/stripe/portal` | **503** (Stripe not configured) | Billing stays **B** |
| `/api/calendar`, `/api/weather`, `/api/github` | **200** on prod | Today tool cards **A** for read |
| Dynamic `/api/projects/<id>`, `/api/people/<id>`, OC publish GET | 200 | Drawer/dossier load **A** |

**57/57 probes passed** with session + PIN unlock on production.

Re-run:

```bash
# Full authenticated probe suite
BASE=https://fleetcrown.orangecat.ch npm run test:authenticated-smoke

# With private-zone unlock (operator PIN — never commit)
SMOKE_PRIVATE_PIN=… BASE=https://fleetcrown.orangecat.ch npm run test:authenticated-smoke

# Legacy route smoke with a minted token
FLEETCROWN_SESSION_TOKEN=… BASE=https://fleetcrown.orangecat.ch npm run smoke
```

---

## 0. Global shell (every authenticated page)

- [x] **S01** Sidebar navigation — **A**
- [x] **S02** Mobile bottom tabs (Today · Control · Loki · More) — **A**
- [x] **S03** Mobile More sheet → nav + Settings + Unlock — **A**
- [x] **S04** Cmd/Ctrl+K palette — search nav — **A**
- [x] **S05** Palette — jump to project on Control (`?focus=`) — **A** nav
- [~] **S06** Palette — run NL command → inject — **B**
- [~] **S07** Palette — voice dictation — **B**
- [~] **S08** Palette — agent prompt shortcuts → inject — **B**
- [~] **S09** Palette — switch agent — **B**
- [x] **S10** Ask Loki button → `/loki?q=` — **A**
- [x] **S11** Sessions drawer — fleet snapshot GET — **A** read
- [x] **S12** Sessions drawer → focus on Control — **A**
- [~] **S13** Push notifications bell — **C** (VAPID / browser support)
- [x] **S14** Theme toggle — **A**
- [x] **S15** Brand version → Releases — **A**
- [x] **S16** Footer → System — **A**
- [x] **S17** Lock private zone — **A**
- [x] **S18** Sign out — **A**
- [x] **S19** Pull-to-refresh — **A**
- [x] **S20** Auto-refresh cadence — **A**
- [x] **S21** SSE bridge DB refresh — **A**
- [x] **S22** Escape closes modal/drawer — **A**

---

## 1. Auth, account lifecycle & gating

### Public / pre-auth

- [x] **A01** Landing `/` — **A**
- [x] **A02** Sign up (email/password) — **A**
- [~] **A03** Sign in — GitHub OAuth — **B**
- [~] **A04** Sign in — Google OAuth — **B**
- [~] **A05** Sign in — OrangeCat OIDC — **B**
- [~] **A06** Sign in — X OAuth 1.0a — **B**
- [x] **A07** Sign in — email/password — **A**
- [~] **A08** Sign in — owner key tab — **C**
- [x] **A09** OAuthAccountNotLinked error — **A**
- [~] **A10** Forgot password — **A** UI; **B** email delivery
- [x] **A11** Reset password (token) — **A**
- [~] **A12** Verify email — **A** link works; **C** not enforced at login
- [x] **A13** Resend verification — **A**
- [x] **A14** Accept invite `/invite/[token]` — **A**
- [~] **A15** First-time setup `/setup` — **C** (no email on user)
- [~] **A16** `/` → `/setup` when 0 users — **C**
- [x] **A17** Public marketing pages — **A**
- [x] **A18** Download Fleet Runner — **A**
- [x] **A19** Legal / docs / releases — **A**
- [x] **A20** Frontier public digest — **A** read
- [x] **A21** Thoughts list + essay — **A** read; **D** no in-app author UI
- [~] **A22** Public profile `/u/[username]` — **C**
- [~] **A23** X-login complete — **B**

### Post-auth gating

- [x] **A24** Onboarding redirect when incomplete — **A**
- [x] **A25** Onboarding — set username — **A**
- [x] **A26** Onboarding — create / skip project — **A**
- [~] **A27** Onboarding — connect Fleet Runner — **C**
- [x] **A28** Team invitee skips project step — **A**
- [x] **A29** Returning user onboarding heal — **A**
- [x] **A30** Private zone PIN unlock `/unlock` — **A**
- [x] **A31** Private zone inline gate `(private)/*` — **A**
- [x] **A32** Today hides private data when locked — **A**
- [x] **A33** Private API 403 when locked — **A**

---

## 2. `/today`

- [x] **T01** Page load + summary — **A** / **C** when PIN locked
- [x] **T02** First-run banner → Control — **A**
- [~] **T03** Plan my day / Wrap up day → Loki — **A** opens; **B** AI reply
- [~] **T04** Log a conversation (modal) — **B** + PIN
- [x] **T05** Capture thought CRUD — **A**
- [x] **T06** SummaryBar deep links — **A**
- [~] **T07** TodayWatch + LokiNudge (Groq compose) — **B**
- [x] **T08** FleetBriefCard — **A**
- [~] **T09** RecentRuns + dispatch — **B**
- [~] **T10** Action queue approve/reject/all — **B** + PIN
- [~] **T11** Dismiss alert — **B** + PIN
- [~] **T12** Goals/events due + Loki — **B** + PIN
- [~] **T13** Abandon stuck goal — **B** + PIN
- [~] **T14** Calendar card — **C** on hosted (`runtimeOnly`); **B** needs `gog` locally
- [x] **T15** Weather card — **A** on prod (open-meteo fallback); **B** if all sources down
- [~] **T16** Habits inline check-off — **A** with PIN; **C** locked
- [~] **T17** Commitments CRUD + fulfill — **B** + PIN
- [~] **T18** Subscriptions upcoming (read) — **B** + PIN
- [x] **T19** LockedZoneBanner → unlock — **A**

---

## 3. `/loki`

- [x] **L01** SSR prefetch — **A**
- [x] **L02** Load projects + conversations — **A**
- [x] **L03** Filter by project — **A**
- [x] **L04** Deep link `?project=` / `?q=` — **A**
- [x] **L05** `loki:prefill` event — **A**
- [x] **L06** New / select / delete conversation — **A**
- [~] **L07** Send chat message (OpenClaw / Groq fallback) — **B**
- [~] **L08** Send dispatch to project — **B** builder
- [x] **L09** Command without project → picker — **A**
- [x] **L10** Agent/model picker — **A**
- [~] **L11** Voice input — **B**
- [~] **L12** Attach files / paste image — **A** upload; **B** vision
- [x] **L13** Suggested action chips — **A**
- [~] **L14** Fleet commands (kick, business plan, create project, …) — **B**
- [~] **L15** Multi-project dispatch — **B**
- [~] **L16** Screenshot dispatch — **B**
- [~] **L17** Footer → Control / terminals — **A** nav; **B** streams
- [x] **L18** Mobile drawers — **A**
- [~] **L19** Prompts “Run” via `/api/loki` — **B**

---

## 4. `/control` (+ subpages)

### Shell & empty state

- [x] **C01** Load fleet + SSE patches — **A**
- [x] **C02** Refresh / pull-to-refresh / deep link focus — **A** select; **B** tab focus
- [x] **C03** Runner offline banner — **A**
- [~] **C04** Pair Fleet Runner (in-app) — **B** Electron
- [~] **C05** Install agent CLIs — **B**
- [~] **C06** Empty: GitHub bulk import — **B**
- [~] **C07** Empty: ~/dev bulk import — **B** Fleet Runner
- [~] **C08** Empty: Bootstrap modal — **B**
- [x] **C09** Empty: manual add project — **A**
- [~] **C10** Fleet autopilot + fleet-kick — **A** PATCH; **B** kick
- [~] **C11** Bulk build / pause — **B** / **A**
- [x] **C12** Search / sort rail — **A**

### Project card (per-project)

- [x] **C13** Open dossier / URL / profile drawer — **A**
- [~] **C14** Switch agent — **B**
- [~] **C15** Focus terminal — **B**
- [~] **C16** Git sync / commit & push — **B** local
- [~] **C17** Capacity auto-reroute — **B**
- [~] **C18** Ready banner + slots 1–9 — **B**
- [x] **C19** Auto-continue pause/play — **A**
- [~] **C20** Send prompt (Enter) — **B** inject
- [x] **C21** Queue prompt (Alt+Enter) — **A** queue CRUD
- [~] **C22** Voice in composer — **B**
- [~] **C23** Orchestration intents (next best, test&fix, …) — **B**
- [~] **C24** Clear context — **B** local only
- [x] **C25** Prompt library fill — **A**
- [~] **C26** Launch agent — **B**
- [~] **C27** Queue AI merge — **B** LLM
- [~] **C28** Workspaces: focus/close/inject/peek — **B**
- [~] **C29** Retry failed command — **B**
- [~] **C30** Agent defaults save / apply tabs — **A** save; **B** apply
- [~] **C31** Modals: NewProject / Launch / Bootstrap — **A**–**B**

### Subpages

- [x] **C32** `/control/import` page — **A** load; **B** import action
- [x] **C33** `/control/import-local` copy script — **A** copy; **B** terminal exec
- [x] **C34** `/control/new-from-scratch` — **A** load; **B** GitHub create
- [~] **C35** `/control/workspace` server PTY — **C** gated on prod

---

## 5. `/terminal`

- [x] **TR01** Cloud / This computer toggle — **A**
- [x] **TR02** Deep link `?source=&tab=` — **A**
- [~] **TR03** Cloud tab xterm stream — **B** box-runner
- [~] **TR04** This computer tab stream — **B** Fleet Runner
- [~] **TR05** Local dev tabs/splits — **C** dev only
- [x] **TR06** Mobile immersive expand — **A**

---

## 6. `/projects` + `/projects/[id]`

- [x] **P01** List / search / filter chips — **A**
- [x] **P02** Open dossier vs quick-edit drawer — **A**
- [x] **P03** `?new=1&name=` OrangeCat deep link — **A**
- [x] **P04** NewProjectButton entity create — **A**
- [x] **P05** GitHub CI panel — **A** API smoke; **B** if github tool down
- [x] **P06** Dossier read (Now / Next / Done) — **A**
- [x] **P07** Quick-edit: name/desc/status/maturity/delete — **A**
- [~] **P08** OrangeCat publish — **B** OC OIDC
- [~] **P09** Brief fill / enrich from repo — **A** CRUD; **B** AI
- [~] **P10** Business plan generate + queue — **B**
- [x] **P11** Log activity interaction — **A**
- [x] **P12** Prompts tab cron jobs — **A**
- [~] **P13** Goals tab link/create/unlink — **A** + PIN
- [x] **P14** Org/team readonly enforcement — **A**
- [x] **P15** Settings → Projects registry CRUD — **A**

---

## 7. Private zone — `/people`

- [x] **PE01** Page load — **A** + PIN
- [x] **PE02** GET `/api/people` list — **A** smoke
- [x] **PE03** GET `/api/people/<id>` — **A** smoke
- [ ] **PE04** Search / sort / health filter — E2E
- [ ] **PE05** Load more pagination — E2E
- [ ] **PE06** Create person (modal) — E2E POST
- [ ] **PE07** Person drawer — name/desc edit — E2E PATCH
- [ ] **PE08** Delete person — E2E
- [ ] **PE09** Attributes / channels CRUD — E2E
- [ ] **PE10** Log interaction — E2E
- [ ] **PE11** Ask Loki from card — E2E
- [~] **PE12** All above when PIN locked — **C** (403)

## 7b. Private zone — `/goals`

- [x] **G01** Page load — **A** + PIN
- [x] **G02** GET `/api/goals` — **A** smoke
- [ ] **G03** Create goal / sub-goal — E2E
- [ ] **G04** Inline edit title/desc/progress/date — E2E
- [ ] **G05** Milestones add/toggle/remove — E2E
- [ ] **G06** Complete / abandon / delete — E2E
- [ ] **G07** Control dispatch from card — **B** E2E
- [~] **G08** When PIN locked — **C**

## 7c. Private zone — `/habits`

- [x] **H01** Page load — **A** + PIN
- [x] **H02** GET `/api/habits` — **A** smoke
- [ ] **H03** Create habit — E2E
- [ ] **H04** Inline edit / toggle active / today done — E2E
- [ ] **H05** Heatmap display — E2E
- [ ] **H06** Link/unlink goals — E2E
- [ ] **H07** Delete habit — E2E

## 7d. Private zone — `/events`

- [x] **E01** Page load — **A** + PIN
- [x] **E02** GET `/api/events` — **A** smoke
- [ ] **E03** Create event — E2E
- [ ] **E04** Inline edit — E2E
- [ ] **E05** Archive / delete — E2E

## 7e. Private zone — `/money`

- [x] **M01** Page load — **A** + PIN
- [ ] **M02** Create subscription — E2E
- [ ] **M03** Mark paid / inline edit / cancel / reactivate / delete — E2E
- [ ] **M04** External verify/cancel URLs — manual

## 7f. Private zone — `/memory`

- [x] **ME01** Page load + stats — **A** + PIN
- [ ] **ME02** RAG index stats (embeddings server) — **B** env

---

## 8. `/prompts`

- [x] **PR01** Browse defaults + user prompts — **A**
- [ ] **PR02** Create / edit / delete user prompt — E2E
- [x] **PR03** Search / scope / category filters — **A**
- [ ] **PR04** Fork template — E2E
- [~] **PR05** Run now — **B** Loki
- [ ] **PR06** Schedule cron — E2E

---

## 9. `/activity`

- [x] **AC01** Timeline filters — **A**
- [~] **AC02** Generate LLM digest — **B**
- [x] **AC03** Legacy redirects → `/activity` — **A**
- [~] **AC04** `GET /api/decisions/feed` — **D** no UI

---

## 10. `/system`

- [x] **SY01** System stats poll — **A**
- [~] **SY02** Fleet doctor — **B**
- [ ] **SY03** Frontier proposals accept/dismiss — E2E
- [~] **SY04** Global auto-continue all — **B**
- [x] **SY05** Cron jobs list — **A**
- [ ] **SY06** Cron run-now / edit — E2E
- [x] **SY07** Memory / failures / audit cards read — **A**

---

## 11. `/settings`

- [x] **ST01** Profile — name, username — **A** page load
- [ ] **ST02** Account — OAuth connect/disconnect — E2E
- [ ] **ST03** Account — set/change password — E2E
- [x] **ST04** Notifications prefs — **A** page
- [x] **ST05** Appearance — **A**
- [x] **ST06** Voice (Loki writing voice) — **A**
- [x] **ST07** Privacy — PIN set/change/remove — **A**
- [~] **ST08** Privacy — export/delete — **D** roadmap
- [x] **ST09** Location — **A** page
- [x] **ST10** Agent tokens list — **A** smoke
- [ ] **ST11** Agent token mint/revoke — E2E
- [~] **ST12** Fleet lifecycle / beacon — **B**
- [x] **ST13** Projects registry — **A**
- [x] **ST14** Team invite create — **A** page
- [~] **ST15** Billing / Stripe — **B** (503 portal on prod)

---

## 12. Checkout (API-only)

- [~] **CH01** `GET /api/checkout/:plan` — **B**
- [~] **CH02** `POST /api/stripe/checkout` — **B**
- [~] **CH03** Billing portal — **B** smoke 503
- [ ] **CH04** Webhook subscription sync — E2E
- [x] **CH05** Plan limits on project count — **A** enforcement

---

## 13. OrangeCat cross-product

- [~] **OC01** Connect OrangeCat OIDC — **B**
- [x] **OC02** Publish GET state — **A** smoke
- [ ] **OC03** Publish POST — **B** E2E
- [~] **OC04** Auto-promote dev-log — **B** cron
- [x] **OC05** OC → FC `?new=1&name=` — **A**

---

## 14. Desktop / Fleet Runner only

- [~] **D01** `fleetcrown://auth?token=` — **B**
- [~] **D02** Auto-pair agent token IPC — **B**
- [~] **D03** Scan ~/dev for import — **B**
- [~] **D04** Local peek IPC — **B**
- [~] **D05** `import-from-local.sh` curl pipe — **B**

---

## 15. Execution E2E (not covered by smoke — dogfood next)

- [ ] **X01** Loki chat → real OpenClaw reply (`npm run dogfood:loki`)
- [ ] **X02** Loki dispatch → Control → builder executes
- [ ] **X03** Control Send → inject → agent runs on box-runner
- [ ] **X04** Terminal Cloud peek-stream interactive
- [ ] **X05** Terminal This computer via Fleet Runner
- [ ] **X06** Orchestration “Next best” full cycle
- [ ] **X07** Prompt Run now → Loki
- [ ] **X08** GitHub create-with-github E2E
- [ ] **X09** OrangeCat publish E2E

---

<!-- checklist ends above -->

## Scorecard (2026-07-04)

| Bucket | Count | Notes |
|--------|-------|-------|
| `[x]` Smoke-verified | ~120 | Pages + GET APIs on prod |
| `[~]` Partial / needs runtime | ~95 | Builder, Loki gateway, OAuth, Stripe, calendar local CLI |
| `[ ]` Not E2E verified | ~35 | Private-zone POST/PATCH, settings mutations, execution |
| **Total checklist items** | **~250** | Sections 0–15 |

**Full implied outcome on hosted prod** (grade **A** end-to-end): still **~40%** — smoke proves shells and read APIs; execution and many mutations are unchecked.

### Top illusion gaps (UI oversells)

1. **Control + Loki dispatch** — queues until box-runner or Fleet Runner executes (`executor-copy.ts` has copy; not on every control).
2. **Orchestration intents** — non-claude adapters 503 on cloud; some openclaw paths 501.
3. **Terminal** — Cloud needs box-runner; This computer needs desktop app.
4. **Loki chat** — OpenClaw gateway required for “real” Loki; else Groq fallback or 503. (**Not** the old “Ivy” name.)
5. **Today calendar** — hosted shows `runtimeOnly` empty state; needs `gog` on a machine with Google CLI.
6. **Thoughts** — no compose/publish in app (markdown files only).
7. **Email verification** — sent but never blocks access.
8. **Setup `/setup`** — can dead-end without OAuth or owner key.
9. **Privacy export/delete** — roadmap copy in Settings.
10. **`/control/workspace`** — exists but prod steers users to Terminal/Runner.

---

## Maintenance

When adding a UI action:

1. Add a row here with ID, API route, and honest grade.
2. If the flow is cloud vs local, also update [cloud-local-workflows.md](./cloud-local-workflows.md).
3. Add the page route to `scripts/smoke.sh` if it is a new top-level `page.tsx`.
4. Add authenticated GET probes to `scripts/test/authenticated-smoke.ts` when the route is session-gated.
5. Bump `last_modified_date` and `last_modified_summary` on this file.

When fixing a gap, upgrade the grade and note the change in `last_modified_summary`.

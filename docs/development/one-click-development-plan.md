# One-Click Development — implementation plan (2026-06-12)

North star (user's words): sign in, press one button that looks like **play**, and all
projects get built without supervision. Same button pauses. Per-project play/pause too.
Project profiles must hold the full static context (what the project should become) —
filled by AI from free-form text/voice, never by forms. Dynamic context (what happened,
what's next) must be one coherent story, not five overlapping surfaces.

## Phase 1 — Play/Pause UX (the wow)
State already exists: `beacon_settings.auto_inject_mode` (on|off) + `entities.auto_inject_mode_override`.

- [ ] 1a. Global play/pause button in the /control hero (big, ▶/⏸, shows "Fleet autopilot:
      building / paused"). PATCH /api/beacon-settings. SSE already refetches on change.
- [ ] 1b. Per-project play/pause button on ProjectCard replacing the ProjectAutopilotToggle
      dropdown. Click toggles effective state via override; small "auto" affordance to
      clear override back to inherit. PATCH /api/projects/{id} (existing contract).
- [ ] 1c. Clear "building is happening" feedback already exists (SSE status, current prompt,
      sent prompts) — make sure the play state visually connects to it (pulsing dot when on).

## Phase 2 — AI-powered project context (no forms)
- [ ] 2a. New route POST /api/projects/[id]/brief: free-form text → Groq (callGroqText) →
      structured patch {description, mission, vision, customers, stack, status, next_step}
      → writes entities.description + attributes upserts. Zod-validated, length-clamped.
- [ ] 2b. UI: "Describe it" box in ProjectOverviewTab — paste/dictate anything, AI fills the
      profile, show what was set. No field-by-field form.
- [ ] 2c. Enrich-from-repo: POST /api/projects/[id]/enrich — fetch README (+ CLAUDE.md if
      present) from gitUrl via user's GitHub token, summarize via Groq, same structured
      patch path as 2a. Button on project profile: "Auto-fill from repo".
- [ ] 2d. Run enrichment for the real projects (FleetCrown, OrangeCat, Revamp-it, Kivvi, …)
      against prod so profiles stop being empty.

## Phase 3 — Dynamic context cleanup (light touch)
/activity is already the consolidated surface; /history and /digests are redirects.
- [ ] 3a. Naming pass only: "Sent prompts" vs "Your prompts" vs reuse autocomplete —
      make labels self-explanatory. No rewrites of working systems.

## Phase 4 — Tell the story
- [ ] 4a. Thoughts post: one-click development / the play button as the product.
- [ ] 4b. Update session file + memory.

## Verification
- [ ] tsc + eslint (pre-commit), npm run smoke
- [ ] Browser-verify /control play/pause + describe-it flow (login butaeff@gmail.com)
- [ ] Push, monitor Vercel deploy to Ready.

Out of scope (explicitly): voice module unification across projects, OrangeCat financing
hooks, robot/physical-world orchestration — vision recorded in the Thoughts post instead.

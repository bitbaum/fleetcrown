# Loki — the conversational command surface

**Status:** design / not built. Captures George's 2026-06-18 vision. Do not implement
without sign-off on the open questions (§6).

This document covers two related-but-distinct ideas, kept in separate sections so they
don't blur together:

- **§3 — The command composer** (one field; natural language; auto-selects the project
  you name; reduces decisions).
- **§4 — The Loki page** (a ChatGPT/Claude/Grok-style page: one composer, a conversation
  list, a project filter).

They converge (§5): the Loki page is where the composer lives, but the composer behaviour
is also useful inside Control/Terminal, so it's specified on its own.

---

## 1. The problem: cognitive load

To make an agent do something today, the operator must hold the *UI's structure* in their
head and make several decisions before any work starts:

1. Which page? (Control vs Terminal vs Prompts.)
2. Which project? (find + select the card.)
3. Which action? (an intent button, or hand-write a prompt.)

That's 3 decisions + spatial memory of the app, every time. The north star is to drive
that toward **one decision, expressed in words**: *say what you want; the system figures
out where and how.*

> "I want to do a code review for kivvi" → it selects kivvi and runs the review. No card
> hunting, no intent button, no prompt authoring.

## 2. The key architectural insight (why this is cheap)

Terminal, Control, and Loki are **three rungs of one ladder** — all of them are "tell an
agent what to do," at decreasing cognitive cost:

| Rung | Surface | Input | Cognitive load | Who |
|------|---------|-------|----------------|-----|
| Low-level | **Terminal** | raw keystrokes | high (you drive the shell) | power user, debugging |
| Mid-level | **Control** | pick project + intent | medium | operator managing the fleet |
| High-level | **Loki** | natural language | low (system infers) | everyone, default |

Loki does **not** need a new execution engine. It sits *above* the dispatch backend that
already exists and that the autopilot loop already uses:

```
Loki composer → parse NL → { project, intent|prompt } → existing dispatch
   (the same /api/control/dispatch + runner injectPty path we just hardened)
```

So Loki is a **new front-end over the same backend**. The composer's only new logic is
*resolution* (NL → project + intent), which is one cheap LLM classification call.

## 3. The command composer (Thread C)

**Behaviour:**
- One text field. You type intent in natural language.
- **Project resolution:**
  - If a project is **explicitly selected** (Loki right panel / Control card) → scope there.
  - Else if the text **names a project** ("…for kivvi", "kivvi: …", "on revampit") → match
    against the project registry (`agent-projects.conf` / entities) and auto-select it.
  - Else **ambiguous** → ask a one-tap disambiguation ("Which project?") rather than guess.
    (Later: bias toward the most-recent / most-active project; see §6.)
- **Intent resolution:** map the phrase to an existing `ORCHESTRATION_INTENTS` id when it
  matches a known verb ("code review" → review, "fix types"/"tests" → test_and_fix,
  "next best"/"keep going" → next_best, "commit" → commit_push, "audit" → full_audit),
  otherwise pass the text through as a free-form prompt. SSOT for the verb→intent map lives
  next to `src/config/control-intents.ts`.
- Resolution is a fast model call (cheap tier) returning `{ projectKey|null, intentId|null,
  prompt }`; low-confidence → ask, don't assume.

**Why it reduces load:** collapses "page → project → action" into one sentence, and degrades
gracefully (explicit selection always wins; ambiguity asks instead of misfiring).

## 4. The Loki page (Thread D)

A new top-level page **above Terminal** in the nav. Layout mirrors ChatGPT/Claude/Grok:

```
┌── left (collapsed nav) ──┬──────────── center ────────────┬──── right ────┐
│ Conversations            │  Conversation transcript        │ Projects      │
│  • kivvi: review (2m)    │  (messages: you ⇄ agent/Ivy)    │ [x] kivvi     │
│  • revampit: workshops   │                                 │ [ ] revampit  │
│  • orangecat: …          │                                 │ [x] orangecat │
│                          │                                 │ …             │
│                          │  ┌── composer ───────────────┐  │  (select/    │
│                          │  │ 🎤  type a command…   📎 ⌄ │  │   deselect    │
│                          │  └────────────────────────────┘ │   filters     │
│                          │     mic · attach · model picker  │   convos)     │
└──────────────────────────┴─────────────────────────────────┴───────────────┘
```

- **Left:** the main nav minimizes to a **conversation list** (most-recent first), like
  ChatGPT threads.
- **Center:** the active conversation transcript + the composer (§3) at the bottom, with
  **microphone** (voice → transcribe → composer), **file attach**, and a **model picker**.
- **Right:** **all projects**, each selectable. Selecting/deselecting projects **filters the
  conversation list** to those projects (and scopes new messages to the selected set).
- **Conversations** are persistent threads, each tagged with 0..n projects. A message in a
  conversation either (a) is answered (chat with Ivy about the project) or (b) dispatches
  work to the project's agent — decided by the same intent resolution as §3.

## 5. How Loki relates to Control and Terminal

- **Loki = the front door** (low cognitive load, conversational). Becomes the default.
- **Control = the dashboard** (see every project's live state, autopilot toggles, the fleet
  at a glance). Loki links into it ("open kivvi in Control").
- **Terminal = the workbench** (raw shell, power use, debugging). Loki/Control link into it.
- A Loki "dispatch a command" and a Control "Next best" click produce the **same**
  `pending_command` → runner → PTY. One backend, three altitudes of UI.

## 6. Open questions (need George's call before building)

1. **Chat vs command vs both.** Is a Loki message primarily *talking about* projects (Ivy
   answers) or *commanding* agents (work runs), or both in one thread? (Leaning: both, with
   intent resolution routing each message.)
2. **Conversation ↔ session.** Does a conversation own a long-running agent session, or are
   dispatches fire-and-forget into the project's existing session? (Leaning: dispatches go to
   the project session; the conversation is the human-readable log + control thread.)
3. **Ambiguous project** with no selection and no mention: ask, or default to most-recent/most-
   active? (Leaning: ask first; learn to pre-select later.)
4. **Model picker** scope: which models, and does it map to agent adapters (Claude/Codex/etc.)?
5. **Voice + attachments**: transcription provider; what attachments do for a dispatch (context
   files handed to the agent?).

## 7. Phased plan

- **Phase 0 (done):** server terminal made usable (input no longer scrambles); this doc.
- **Phase 1 — composer in Control (small, high ROI):** add NL resolution to Control's existing
  prompt field: "code review for kivvi" auto-selects kivvi + maps to the review intent. Reuses
  dispatch. Proves the resolution layer with almost no new surface.
- **Phase 2 — Loki page scaffold:** conversations table + the 3-pane layout; composer wired to
  Phase-1 resolution; chat via Ivy; dispatch via Control backend; project-filter on the right.
- **Phase 3 — affordances:** microphone, file attach, model picker.
- **Phase 4 — learned context:** pre-select likely project, surface suggested next commands,
  progressively remove decisions (the cognitive-load north star).

## 8. Cross-references

- **Engineering standards (non-negotiable):** build this per `CONTRIBUTING.md` →
  "Engineering Standards" and the global standards imported in `CLAUDE.md` —
  SSOT, DRY, SoC, no god files, no hardcoded values, the four-layer design system,
  config-driven, first-principles. The resolver derives intent ids from
  `ORCHESTRATION_TASK_INTENT_IDS`; the composer reuses the existing dispatch path
  and `ui-*` classes rather than re-rolling either.
- Terminal parity / usability: `docs/terminal-parity.md` (Thread A — separate concern).
- Cleanup of organic-growth cruft: `docs/debt-reduction-roadmap.md` (Thread B).
- Dispatch backend Loki builds on: `docs/architecture/agent-execution-platform.md`,
  `src/config/control-intents.ts`, the runner inject path (`desktop/src/main/poller.ts`).

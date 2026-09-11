# How Loki answers

**Status:** live. **Last modified:** 2026-09-11.

This is the answering pipeline — how a question becomes a grounded answer.
`docs/loki-command-surface.md` covers the other half of Loki: the composer, the
dispatch fast paths, and the command surface. That document predates everything
here and does not describe it.

---

## The failure this design exists to prevent

On 2026-09-11 the operator filed two reports through FleetCrown's own feedback
widget, watched nothing happen, and asked Loki:

> **what was the most recent feedback sent**
> *Not in your data.*

Every part of that was wrong except the sentence itself. Both reports were in
`site_feedback`, filed minutes earlier. Four runs spawned from them were sitting
in `waiting`. Nineteen runs had errored in the previous two days. The answer was
nevertheless *honest*: Loki had been handed no records at all, so "Not in your
data" was true of what it could see — and a truthful negative is far worse than
an error, because it reads as a checked answer. Nothing on screen distinguished
"I looked and found nothing" from "I was shown nothing to look at."

Three independent causes, each sufficient on its own:

1. **No source read the feedback table.** Not a tool, not a seed. The word did
   not appear anywhere under `src/lib/agent/`. Nor did runs, sessions, alerts,
   or notes. Loki could see the "life" half of the product (people, projects,
   goals) and none of the "fleet" half that gives FleetCrown its name.
2. **The prompt budget was arithmetically impossible.** One module constant —
   Groq's 12000-token minute window × 0.8 ÷ 3 rounds = 3200 tokens — applied to
   every vendor. Groq had since cut the window to 8000, and the prompt's fixed
   cost (system prompt ≈ 1300 tokens plus the native tool schema ≈ 1000) already
   consumed almost all of 3200. The fit for "largest fact count that still fits"
   correctly returned zero. Production logged `[loki] round 1: 40 facts exceed
   the call budget — sending 0` and sent the turn anyway.
3. **The richer context existed but was on the wrong path.** Approvals, the
   knowledge index and the economy feed were seeded only inside
   `askLokiViaGateway` — the *fallback*. The primary tool loop seeded people and
   projects alone. So the approval queue that was deliberately seeded in #262
   "so it survives losing the tool loop" was, on the path that normally ran,
   reachable only by a tool call the loop could not afford to make.

Fixing any one of these would have left the other two serving the same sentence.

---

## The shape now: retrieve first, then reason

```
question
   │
   ├─► planRetrieval()            pure, no model, never rate-limited
   │      reads the words, returns the sources to fetch, subject FIRST
   │
   ├─► buildSeed()                every planned source, in parallel
   │      Facts (typed records, <not recorded> for gaps)
   │      + Directives (SQL-computed answers the model may only phrase)
   │
   ├─► model call                 ONE call answers most turns
   │      tools offered for depth, not for basic retrieval
   │
   ├─► tool rounds (≤2)           only when the records do not cover the ask
   │
   ├─► verifyAnswer()             deterministic, no extra model call
   │      one repair pass, kept only if it DELETED and invented nothing
   │
   └─► answer + provenance        model, sources read, tools used, verdict
```

**Why the planner is a keyword matcher and not a model.** A tool loop needs a
healthy model and a prompt that fits a per-minute window *before* it can ask its
first question. That is the exact resource that was missing. A regex is dumber
than a model and is never rate-limited, and it only has to answer the cheap
question — *is this about feedback?* — so the model's one call can go on the
expensive one: *what does this feedback mean for the operator?* This is how
OrangeCat's Cat has always worked (fifteen sources fetched in parallel before
the model is called), and Cat is the assistant in this fleet people rate.

Cues are matched loosely on purpose. A false positive costs a few hundred tokens
of records the model ignores. A false negative costs a confident wrong answer
about the operator's own records. Those are not symmetric.

---

## The rule that closes the class

> **Every read tool's data must also be reachable from the seed.**

A source reachable only by tool call is invisible on every turn where the tool
loop cannot run. That has now bitten twice — the approval queue (2026-08-14) and
feedback (2026-09-11) — with the identical symptom both times.

The seed provides *survivability*; the tool adds *depth* (a filter, a name, a
wider window). So both call the same adapter in `src/lib/agent/sources*.ts`.
One definition, two callers.

`scripts/test/loki-retrieval-plan.ts` enforces it: a read tool with no seed
source fails the build, and a seed source no question can reach fails too. That
gate found a real orphan on its first run (the OrangeCat economy feed, fetchable
but unreachable), which is the argument for having it.

---

## Budgets follow the vendor

`linkPromptBudgetTokens(link)` in `src/config/chat-models.ts`. Groq meters
tokens per minute per model (8000 as of 2026-09-11), so its budget is small and
derived from that window. OpenRouter's free models carry 128k–1M contexts, so
theirs is capped by usefulness (24k) rather than by the window.

The prompt is sized against the **largest** usable link, and `callModelWithTools`
**skips** any link whose budget the prompt exceeds — a preflight, not a failure.
Groq still serves the small fast turns; the big ones go straight to the vendor
with room instead of being shed to fit the vendor without it.

Both are env-tunable with no deploy: `LOKI_GROQ_TPM`, `LOKI_PROMPT_TOKENS_MAX`.

And when the fixed overhead exceeds *every* budget, the loop **throws** rather
than sending a prompt with an empty Records block. An empty Records block is
what produces a truthful "Not in your data." about records that exist.

---

## Provenance is part of the answer

Every turn returns, and every surface renders: which brain served it
(`tool-loop` / `gateway` / `groq-fallback`), the model, what was retrieved per
source, which tools ran, the real elapsed time, and the grounding verdict.

The verdict is the load-bearing one. The harness always computed it and the core
always returned it; the `/loki` route dropped it on persist and the floating
assistant never read it, so an answer whose unsupported claims survived the
repair pass rendered pixel-identical to a clean one. That is the failure the
harness exists to prevent, reintroduced at the last inch. `PROVENANCE_KEYS` in
`src/lib/loki/provenance.ts` is the contract, and
`scripts/test/loki-provenance.ts` proves by mutation that dropping the grounding
key loses the warning.

One journal line per served turn, too — `[loki] turn via=… retrieved=… tools=…
grounded=…`. Before this, a working turn logged nothing and a degraded turn
logged only its failure, so "how is Loki actually doing" had no answer short of
asking the operator.

---

## Files

| File | Role |
|---|---|
| `src/lib/agent/plan.ts` | the retrieval planner: question → sources, limits |
| `src/lib/agent/cues.ts` | the pure cue predicates the planner reads |
| `src/lib/agent/context.ts` | `buildSeed` — fetches the plan in parallel, one seed for both paths |
| `src/lib/agent/sources.ts` | people, projects, approvals, knowledge, economy |
| `src/lib/agent/sources-work.ts` | goals, habits, commitments, crew, assignments, notes |
| `src/lib/agent/sources-fleet.ts` | feedback, runs, agent sessions, alerts, the fleet pulse |
| `src/lib/agent/brief.ts` | `buildDailyBrief` + `buildFleetBrief` — SQL-computed answers |
| `src/lib/agent/loop.ts` | rounds, fact budget, verification, repair guards |
| `src/lib/agent/llm.ts` | the chain walk, both tool protocols, the size preflight |
| `src/config/chat-models.ts` | the chain and the per-link prompt budgets |
| `src/lib/loki/provenance.ts` | the provenance shape, persist/read/render |
| `src/lib/loki-core.ts` | `askLoki` — path preference, rationing, logging |

## Gates

| Test | Proves |
|---|---|
| `loki-retrieval-plan.ts` | the planner routes the real failing questions; no tool-only data; no orphan sources; shipped chips reach what they promise |
| `loki-prompt-budget.ts` | budgets follow the vendor; the shipped overhead is measured against the retired budget; zero facts is detectable |
| `loki-provenance.ts` | the verdict survives persist→reload, and dropping it demonstrably loses the warning |
| `agent-tool-loop.ts` | protocol tolerance, fact accumulation, repair guards, bounds, history, empty-prompt refusal |

# agent/core — the grounding harness

Pure, dependency-free TypeScript shared by **Loki** (FleetCrown) and **Cat**
(OrangeCat). No DB, no network, no framework, no imports outside this directory.
That constraint is what makes it mirrorable, and it is enforced by the drift
check — do not relax it.

## What it is for

Both assistants had the same class of failure: a model asked to fill a rigid
answer format against thin context invents the missing parts, and the invention
is indistinguishable from the truth because both arrive as confident prose.

The harness makes unsupported claims **hard to express** rather than merely
discouraged:

| Module | Mechanism |
|---|---|
| `facts.ts` | Records with a **declared field set**. Fields with no stored value render as an explicit `<not recorded>`, so absence is a stated negative rather than silence. Each record gets a citation id. |
| `contract.ts` | A rules block **generated from this turn's facts** — enumerating the legal citation ids and the concrete gaps — plus `Directive`, for answers the app computed in SQL and the model may only phrase. |
| `verify.ts` | A deterministic post-generation check. Flags citations that resolve to nothing, and proper nouns / numbers / paths with no source in the records or the user's message. No extra model call. |

## Why absence must be explicit

Loki once reported a contact as *"Ilya Druzhnikov (UZH)"*. The stored record had
no organisation field, and the string `UZH` appears nowhere in the operator's
data — it is the substring inside dr**UZH**nikov, surfaced by a keyword match and
then narrated as an affiliation.

A field the model was never shown is easy to invent. A field it was shown as
`affiliation: <not recorded>` is a specific negative it has to actively
contradict. That is the whole design.

## Why the verifier is deterministic

It runs on **every** turn, including free-tier ones on small models — which is
exactly where fabrication is most likely. A verifier that costs a frontier call
is one that gets disabled where it matters most.

It works because fabrication is overwhelmingly *nominal*: models invent
organisations, titles, file paths, phone numbers and dates. Those are
mechanically recognisable and, if genuine, must appear in the retrieved records.

## Mirroring — read before editing

This directory is **duplicated verbatim** in two repos:

```
fleetcrown/src/lib/agent/core/      ← canonical
orangecat/src/services/agent-core/  ← mirror
```

`scripts/test/agent-core-drift.ts` in **both** repos compares SHA-256 per file
and fails CI on any difference. So:

1. Edit the FleetCrown copy.
2. Run `npm run sync:agent-core` (FleetCrown) to push the mirror.
3. Commit both repos.

This duplication is deliberate and temporary. The two apps have incompatible
data layers (Drizzle/Postgres vs Supabase), so a shared package was not worth
blocking on — but two silently-diverging copies of "what counts as grounded"
would be worse than either. The drift check buys SSOT-in-practice now; the exit
is extraction to `@fleet/agent-core` (the `@fleet/ai-forms` pattern), after
which both repos import instead of mirroring.

## What belongs here vs in the app

**Here:** anything that defines what grounding *means*.
**In the app:** anything that knows where data lives — the adapters that map
rows to `Fact`s (`fleetcrown/src/lib/agent/sources.ts`,
`orangecat/src/services/cat/sources.ts`) and the SQL behind `Directive`s.

If you find yourself importing a DB client here, the code belongs in an adapter.

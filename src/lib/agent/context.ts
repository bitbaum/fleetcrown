/**
 * Loki's grounded context assembly — the replacement for the prose fleet-context
 * block that produced the 2026-08-13 fabrications.
 *
 * What changed, and why each change is load-bearing:
 *
 *   Before                                  After
 *   ──────────────────────────────────────  ────────────────────────────────────
 *   Projects + RAG chunks only.             Projects, PEOPLE, and RAG — people
 *                                           were never in context, which is why
 *                                           "who should I reach out to" was
 *                                           answered from an unrelated JSON blob
 *                                           in the OpenClaw agent's workspace.
 *
 *   Prose blob per project.                 Typed records with declared fields;
 *                                           unstored fields render as an
 *                                           explicit `<not recorded>`.
 *
 *   "cite the [source]" as advice.          Enumerated citation ids, checked
 *                                           mechanically after generation.
 *
 *   Goals/habits/commitments absent, but    Computed by SQL and handed over as
 *   routinely asked about.                  settled results.
 *
 * Budgeting note: the fact set is capped, because a small model given forty
 * records answers about the wrong one. Cheap deterministic facts (people,
 * projects) are kept whole; retrieved documents are the elastic part.
 */
import { assignFactIds, renderFacts, type Fact } from "@/lib/agent/core/facts";
import { buildGroundedContext, type Directive } from "@/lib/agent/core/contract";
import { peopleFacts, projectFacts, documentFacts, economyFacts } from "@/lib/agent/sources";
import { buildDailyBrief } from "@/lib/agent/brief";

/** Retrieved-document budget. Small models degrade past roughly this many. */
const DOC_K = 6;
/** External (OrangeCat) items per kind — a supporting signal, not the subject. */
const ECON_K = 3;

/**
 * Cues that the turn is a planning/triage question, which is when the computed
 * brief is worth its tokens. Everything else skips it — a brief on every turn
 * would push the records out of the window on small-context models.
 *
 * Matched loosely on purpose: a false positive costs tokens, a false negative
 * costs a fabricated answer, and those are not symmetric.
 */
const PLANNING_CUES =
  /\b(plan|today|day|urgent|priorit|attention|focus|stuck|due|deadline|overdue|next|habit|commit|risk|blocked|first)\b/i;

export type GroundedTurn = {
  /** The full block to prepend to the model's input. */
  context: string;
  /** Facts with ids assigned — the caller needs these to verify the answer. */
  facts: Fact[];
  /** Computed answers, kept so the verifier can admit them as evidence. */
  directives: Directive[];
};

/**
 * Assemble everything Loki is allowed to know this turn.
 *
 * Best-effort by design: any source that throws contributes nothing rather than
 * failing the turn. The contract adapts automatically — with fewer facts it
 * permits fewer citations, and with none it instructs a refusal.
 */
export async function buildGroundedTurn(userId: string, message: string): Promise<GroundedTurn> {
  const wantsBrief = PLANNING_CUES.test(message);

  const [people, projects, docs, economy, directives] = await Promise.all([
    peopleFacts(userId, message).catch(() => [] as Fact[]),
    projectFacts(userId).catch(() => [] as Fact[]),
    documentFacts(userId, message, DOC_K).catch(() => [] as Fact[]),
    economyFacts(message, ECON_K).catch(() => [] as Fact[]),
    wantsBrief ? buildDailyBrief(userId).catch(() => [] as Directive[]) : Promise.resolve([] as Directive[]),
  ]);

  // Order matters for attention: deterministic records first (they are simply
  // true), then retrieved documents, then external signal (ranked guesses about
  // relevance, from another system entirely).
  const facts = assignFactIds([...projects, ...people, ...docs, ...economy]);

  return {
    facts,
    directives,
    context: buildGroundedContext({ facts, directives, renderedFacts: renderFacts(facts) }),
  };
}

/**
 * Evidence strings the verifier may treat as legitimately known beyond the fact
 * set — currently the computed brief, whose contents are true by construction
 * but do not live in any Fact.
 */
export function directiveEvidence(directives: Directive[]): string[] {
  return directives.flatMap((d) => [d.question, ...d.answer]);
}

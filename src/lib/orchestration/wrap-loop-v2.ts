/**
 * LOOP v2 wrapper for strategist-composed dispatch bodies.
 *
 * Background. /api/control/dispatch can return three actions: QUEUE (fire
 * the queue's head), NEXTBEST (fire the canned next_best template — which
 * IS the full LOOP v2 preamble), and COMPOSED (Groq writes a fresh prompt
 * body tailored to the current context). The first two paths inherit LOOP
 * v2 discipline because the templates carry it. COMPOSED bodies didn't —
 * they were free-form prose written by Groq, with no accountability line,
 * no T0/T1/T2 triage, no scope cap, no handoff requirement.
 *
 * This wrapper closes that gap. Every COMPOSED body emitted by the
 * strategist gets the invariants prepended before it reaches the agent.
 * Templates "can't opt out" — the dispatch route applies this
 * unconditionally to action === "composed" results.
 *
 * Why prepend (not append): the agent's first read sets the operating
 * frame. Putting "open with Picked <X> (T_); displaced <Y>" at the top
 * makes it the response shape the agent commits to before it engages
 * with the substantive task below.
 *
 * Why a compact subset of the next_best preamble (not the whole thing):
 * the next_best body's job is to TRIAGE — read state, pick a task,
 * justify the pick. A COMPOSED body already names the task ("fix the
 * failing test at X"). Re-running the pick algorithm would either
 * waste tokens or, worse, give Groq's composed pick the opportunity to
 * be overridden by the agent's own re-pick. Keep what's universal
 * (accountability, classification, scope, handoff) and drop what the
 * composed body already supplies (the actual decision).
 */

export const LOOP_V2_PREAMBLE = `Before acting: open your response with "Picked <X> (T_); displaced <Y>." where T is the severity tier:
  T0 = broken in production OR data integrity at risk
  T1 = a real user is blocked today or by ship
  T2 = nothing broken, no user blocked, code/DX improvement

Scope: one user-visible outcome per session. If the work needs more than 3 commits, split into separate sessions and stop. Pivot only at commit boundaries — never mid-commit.

When done, update the session handoff file (~/.claude/sessions/<project>.md) with exactly these lines:
status: ready | working | blocked
done: <one sentence what you completed>
next: <precise next step or empty when nothing mid-flight>
tests: <N pass · N fail, or 'no suite'>
todos: <count of open TODO/FIXME/HACK items>
health: <good | needs attention | critical>

──────────────────────────────────────────────────────────────────────
Substantive task (from the strategist):
──────────────────────────────────────────────────────────────────────
`;

/**
 * Prepend LOOP v2 invariants to a strategist-composed body. Idempotent: if
 * the body already contains the preamble (defensive — should not happen in
 * the dispatch path, but cheap to guard against), returns the body as-is
 * so a future double-wrap doesn't double-charge tokens.
 */
export function wrapLoopV2(composedBody: string): string {
  const trimmed = composedBody.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith(LOOP_V2_PREAMBLE.trim().slice(0, 64))) return trimmed;
  return `${LOOP_V2_PREAMBLE}${trimmed}\n`;
}

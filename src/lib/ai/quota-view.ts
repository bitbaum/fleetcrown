/**
 * Vendor counters, rendered as something an operator can act on.
 *
 * Pure — no database, no clock beyond what it is handed — so the wording is
 * testable without standing up either.
 *
 * ── THE RULE THIS FILE ENFORCES ──────────────────────────────────────────────
 *
 * A number that does not imply an action is decoration. "78%" tells you nothing
 * you can do. "About 40 more answers, then it moves to OpenRouter" tells you
 * whether to care.
 *
 * So every row carries three things and not one: what is left, in the unit a
 * person thinks in; when it comes back; and what happens next when it runs out.
 *
 * ── THREE STATES, NEVER TWO ──────────────────────────────────────────────────
 *
 * known · unknown · exhausted.
 *
 * A vendor nobody has called today has NO reading, and rendering that as a full
 * tank is the same mistake as trusting a provider's usage endpoint — which was
 * measured reporting an untouched allowance while the key was locked out.
 * Rendering it as empty invents an outage. It is drawn as unknown, and the
 * reason it is unknown is stated.
 */

/** One vendor counter as the UI needs it. */
export type QuotaRowView = {
  provider: string;
  model: string;
  state: "known" | "unknown" | "exhausted";
  /** What is left, in answers where that is knowable. Null when unknown. */
  answers: number | null;
  /** The raw figure, for the reader who wants it. */
  detail: string;
  /** When it refills, in words. Null when the vendor did not say. */
  refills: string | null;
  /** What happens when this one is spent — the actionable half. */
  consequence: string;
  /** 0..1 for a gauge, or null when there is nothing to draw a level against. */
  level: number | null;
  /** Whether this row should draw attention. */
  urgent: boolean;
};

export type QuotaReadingRow = {
  provider: string;
  model: string;
  scope: string;
  window: string;
  quotaLimit: number | null;
  remaining: number;
  resetAt: Date | string | null;
  observedAt: Date | string;
};

/** Below this fraction of the ceiling, a row earns attention. */
const URGENT_AT = 0.2;
/**
 * A reading older than this is stale enough that the counter has probably
 * refilled without us hearing. Per-minute windows go stale in minutes; a day
 * counter is good until its reset.
 */
const STALE_MINUTE_MS = 5 * 60 * 1000;

/**
 * Measured cost of one Loki turn, for translating tokens into answers.
 *
 * A guess stated as a guess. The `turns` column on ai_spend exists so this can
 * become a query over reality rather than a constant; until there is enough
 * traffic to compute a mean, a round number the reader can sanity-check beats a
 * precise-looking one nobody measured.
 */
export const TOKENS_PER_ANSWER = 6000;

function ms(v: Date | string | null): number | null {
  if (v === null) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/** "in 4 hours", "in 12 minutes", "now". Null when the vendor did not say. */
export function refillsIn(resetAt: Date | string | null, now: number): string | null {
  const at = ms(resetAt);
  if (at === null) return null;
  const delta = at - now;
  if (delta <= 0) return "now";
  // Tested against the raw delta, not the rounded minutes: 40 seconds rounds
  // UP to 1, so a rounded check never reaches this branch and the sub-minute
  // case silently reads as "in 1 minute".
  if (delta < 60_000) return "in under a minute";
  const mins = Math.round(delta / 60000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Render one counter.
 *
 * `nextProvider` is what the chain would fall to — the consequence half. When
 * there is nothing after this link, say so plainly rather than implying a
 * safety net that does not exist.
 */
export function describeQuota(
  row: QuotaReadingRow,
  opts: { now: number; nextProvider: string | null; tokensPerAnswer?: number },
): QuotaRowView {
  const perAnswer = opts.tokensPerAnswer ?? TOKENS_PER_ANSWER;
  const observed = ms(row.observedAt);
  const stale =
    row.window === "minute" && observed !== null && opts.now - observed > STALE_MINUTE_MS;

  const answers =
    row.scope === "requests"
      ? Math.max(0, Math.floor(row.remaining))
      : Math.max(0, Math.floor(row.remaining / perAnswer));

  const unit = row.scope === "requests" ? "requests" : "tokens";
  const per = row.window === "day" ? " today" : row.window === "minute" ? " this minute" : "";
  const detail =
    row.quotaLimit === null
      ? `${row.remaining.toLocaleString("en-US")} ${unit} left${per}`
      : `${row.remaining.toLocaleString("en-US")} of ${row.quotaLimit.toLocaleString("en-US")} ${unit}${per}`;

  const consequence = opts.nextProvider
    ? `then it moves to ${opts.nextProvider}`
    : "this is the last link — after it, answers wait for the reset";

  // A per-minute counter read five minutes ago says nothing about now. Reporting
  // it as current is how a dashboard ends up confidently wrong.
  if (stale) {
    return {
      provider: row.provider,
      model: row.model,
      state: "unknown",
      answers: null,
      detail: "not measured recently — this counter refills every minute",
      refills: null,
      consequence,
      level: null,
      urgent: false,
    };
  }

  const exhausted = row.remaining <= 0 || (row.scope === "tokens" && answers === 0);
  const level =
    row.quotaLimit && row.quotaLimit > 0
      ? Math.max(0, Math.min(1, row.remaining / row.quotaLimit))
      : null;

  return {
    provider: row.provider,
    model: row.model,
    state: exhausted ? "exhausted" : "known",
    answers,
    detail,
    refills: refillsIn(row.resetAt, opts.now),
    consequence,
    level,
    urgent: exhausted || (level !== null && level <= URGENT_AT),
  };
}

/**
 * A vendor we hold a key for but have not heard from.
 *
 * This row exists so the absence is VISIBLE. Omitting the provider entirely
 * would let a reader assume the list is the whole fleet, and silently drop the
 * one that is about to serve their next turn.
 */
export function unknownQuota(provider: string, reason: string): QuotaRowView {
  return {
    provider,
    model: "—",
    state: "unknown",
    answers: null,
    detail: reason,
    refills: null,
    consequence: "will be measured on the next answer it serves",
    level: null,
    urgent: false,
  };
}

/**
 * The one-line summary for the top of the page.
 *
 * Leads with what is actionable. If something is spent, that is the headline;
 * if everything is unknown, say THAT rather than implying health nobody checked.
 */
export function summarise(rows: QuotaRowView[]): string {
  if (rows.length === 0) return "No AI providers are configured.";
  const known = rows.filter((r) => r.state === "known");
  const exhausted = rows.filter((r) => r.state === "exhausted");
  const unknown = rows.filter((r) => r.state === "unknown");

  if (known.length === 0 && exhausted.length === 0) {
    return `Nothing measured yet across ${unknown.length} provider${unknown.length === 1 ? "" : "s"} — the first answer each serves will report its own limits.`;
  }
  if (exhausted.length > 0 && known.length === 0) {
    const first = exhausted[0];
    const when = first?.refills ? ` Comes back ${first.refills}.` : "";
    return `Every measured provider is spent.${when} Answers fall back to whatever is left in the chain.`;
  }
  const total = known.reduce((n, r) => n + (r.answers ?? 0), 0);
  const spentNote =
    exhausted.length > 0
      ? `, ${exhausted.length} provider${exhausted.length === 1 ? " is" : "s are"} spent`
      : "";
  const unknownNote = unknown.length > 0 ? `, ${unknown.length} not measured yet` : "";
  return `About ${total.toLocaleString("en-US")} more answer${total === 1 ? "" : "s"} available${spentNote}${unknownNote}.`;
}

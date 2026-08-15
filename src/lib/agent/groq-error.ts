/**
 * Groq 429 classification — pure, because the kinds of 429 need OPPOSITE
 * responses and telling them apart is the whole trick.
 *
 * Groq returns 429 for three unrelated conditions:
 *
 *   CAPACITY — "Rate limit reached ... on tokens per minute (TPM): Limit 12000,
 *              Used 11800, Requested 400. Please try again in 3.6s"
 *              The per-MINUTE window is momentarily spent. Waiting helps, and a
 *              smaller model has its own per-minute budget, so stepping down
 *              helps too.
 *
 *   SIZE     — "Request too large ... Limit 6000, Requested 15041, please
 *              reduce your message size"
 *              ONE request exceeds the entire per-minute allowance. Waiting can
 *              never help: the window never grows big enough. And stepping down
 *              makes it strictly WORSE, because the cheaper model has a smaller
 *              ceiling (verified 2026-08-14: llama-3.3-70b-versatile = 12000
 *              TPM, llama-3.1-8b-instant = 6000). The only cure is a smaller
 *              prompt.
 *
 *   DAILY    — "Rate limit reached ... on tokens per day (TPD): Limit 100000,
 *              Used 99331, Requested 4589. Please try again in 56m26.88s"
 *              The budget for the WHOLE DAY is gone, and it is shared across the
 *              org and across models. Every response that works for capacity is
 *              actively harmful here: stepping down draws on the SAME exhausted
 *              budget, and the bounded ~25s wait is nowhere near a reset
 *              measured in tens of minutes — it just adds dead latency to a turn
 *              that was already lost.
 *
 * Treating SIZE as CAPACITY is what broke Loki's tool loop for every question:
 * an oversized prompt 429'd, the handler "helpfully" stepped down to the model
 * with HALF the ceiling, waited 25 pointless seconds, and then gave up — so the
 * loop fell back to a toolless path on every single turn.
 *
 * Treating DAILY as CAPACITY is the same mistake one level deeper, and it is why
 * this file has three kinds rather than two: the distinction is not "which limit
 * was hit" but "what, if anything, the caller can do about it".
 */

export type GroqLimitKind = "size" | "capacity" | "daily";

/**
 * Which kind of 429 this is. Keyed on the body, because the status code alone
 * cannot tell them apart — all three share the status, the `type`, and the
 * `code`, and two of the three even share the phrase "tokens per minute (TPM)".
 * The headers describe the window, not the request, so they cannot decide it
 * either.
 *
 * Daily is tested FIRST: a TPD body also matches the "Rate limit reached"
 * wording that means capacity, so the more specific limit has to win or the
 * cheaper check silently absorbs it.
 *
 * Defaults to "capacity" when the body is unrecognisable: that path retries and
 * degrades, where guessing "size" would shed context that was never the problem
 * and guessing "daily" would give up on a turn that might well have succeeded.
 */
export function classifyGroqLimit(body: string): GroqLimitKind {
  // Requests-per-day is the same situation as tokens-per-day: nothing the caller
  // does before the reset can help, so it gets the same treatment.
  if (/per day|\bTPD\b|\bRPD\b/i.test(body)) return "daily";
  return /request too large|reduce your message size|reduce the length/i.test(body) ? "size" : "capacity";
}

/**
 * The wait Groq itself named, in seconds, or null when it named none.
 *
 * Worth parsing rather than approximating because the honest number is the whole
 * difference between a message a user can act on and one that wastes their time:
 * "try again shortly" invites an immediate retry, and on a daily cap that retry
 * is guaranteed to fail for the next hour. Groq states the real figure — the
 * only reason not to pass it on is not having read it.
 *
 * Handles the two shapes the API emits: "3.6s" and "56m26.88s".
 */
export function groqRetryAfterSeconds(body: string): number | null {
  const m = /try again in\s+(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i.exec(body);
  if (!m || (!m[1] && !m[2])) return null;
  return Math.ceil(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
}

/** That wait as something a person reads: "3s", "2 minutes", "about 1 hour". */
export function humanizeWait(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 90) return `${Math.ceil(seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `about ${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`;
}

/**
 * What to tell the operator when a 429 ends the turn.
 *
 * Lives beside the classifier so both Groq wrappers say the same thing, and
 * because the message is a direct consequence of the classification: the only
 * useful content in a rate-limit error is whether retrying can work and when.
 * "Try again shortly" on an exhausted DAY is the failure reported as "not
 * working" — technically a rate limit, but it invites exactly the retry that is
 * guaranteed to fail for the next hour.
 *
 * Returns a CLAUSE, not a sentence: callers embed it ("Loki is offline — ..."),
 * so it neither capitalises nor names Loki, which would read double.
 */
export function rateLimitMessage(raw: string): string {
  const wait = humanizeWait(groqRetryAfterSeconds(raw));
  switch (classifyGroqLimit(raw)) {
    case "daily":
      return `the daily model quota is used up${wait ? ` (resets in ${wait})` : ""}`;
    case "size":
      // Retrying is not the fix and saying so prevents a pointless loop; the
      // real repair (a smaller prompt) is ours to make, not the operator's.
      return "the question needed more context than the model allows in one request";
    case "capacity":
      return `the model provider is rate-limited${wait ? ` (retry in ${wait})` : " — try again shortly"}`;
  }
}

/**
 * Groq 429 classification — pure, because the two kinds of 429 need OPPOSITE
 * responses and telling them apart is the whole trick.
 *
 * Groq returns 429 for two unrelated conditions:
 *
 *   CAPACITY — "Rate limit reached ... Limit 12000, Used 11800, Requested 400"
 *              The window is momentarily spent. Waiting helps. A smaller model
 *              has its own budget, so stepping down helps too.
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
 * Treating these as one thing is what broke Loki's tool loop for every question:
 * an oversized prompt 429'd, the handler "helpfully" stepped down to the model
 * with HALF the ceiling, waited 25 pointless seconds, and then gave up — so the
 * loop fell back to a toolless path on every single turn.
 */

export type GroqLimitKind = "size" | "capacity";

/**
 * Which kind of 429 this is. Keyed on the body, because the status code alone
 * cannot tell them apart and the headers report the window, not the request.
 *
 * Defaults to "capacity" when the body is unrecognisable: that path retries and
 * degrades, where guessing "size" would shed context that was never the problem.
 */
export function classifyGroqLimit(body: string): GroqLimitKind {
  return /request too large|reduce your message size|reduce the length/i.test(body) ? "size" : "capacity";
}

/**
 * 429 classification — now owned by `ai-ration`.
 *
 * The three kinds of 429 (capacity / size / daily) and their opposite responses
 * were learned here the expensive way, so the knowledge was extracted rather
 * than left in one app. This file remains the import path FleetCrown uses and
 * keeps the Groq-flavoured names its callers were written against.
 *
 * The upstream names are vendor-neutral because the classifier is: it is applied
 * to every OpenAI-compatible vendor, with an unrecognised body degrading to
 * "capacity" — the kind whose response is harmless when guessed wrong.
 *
 * Keep it a re-export; a local copy would quietly miss upstream corrections.
 * (One already landed: `humanizeWait`'s singular hour was unreachable, so an
 * hour-long wait was announced as "about 2 hours".)
 */
export {
  type RateLimitKind as GroqLimitKind,
  classifyRateLimit as classifyGroqLimit,
  retryAfterSeconds as groqRetryAfterSeconds,
  humanizeWait,
  rateLimitMessage,
} from "ai-ration";

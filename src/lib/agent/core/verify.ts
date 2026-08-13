/**
 * Groundedness verifier — MIRRORED MODULE (see core/README.md).
 *
 * Runs on the generated answer and reports claims the fact set does not support.
 * Deliberately deterministic: no second model call, no embedding round-trip, no
 * added cost or latency. That is a requirement, not a shortcut — this must run
 * on every turn including the free-tier ones, and a verifier that costs a
 * frontier call is one that gets disabled exactly where it is needed most.
 *
 * The insight that makes a cheap check work: fabrication is overwhelmingly
 * NOMINAL. Models invent organisations, titles, people, file paths, phone
 * numbers and dates — tokens that are mechanically recognisable and that must,
 * if genuine, have appeared in the retrieved records or in what the user said.
 * Grammar and hedging are hard to check; proper nouns and digits are easy.
 *
 * Scored against the real failure this was built from, every fabricated claim
 * is caught by the proper-noun or numeric rule:
 *
 *   "Ilya Druzhnikov (UZH)"                    → UZH: novel acronym
 *   "Accelerator & Bridge Program Manager"     → novel proper-noun run
 *   "University of Liechtenstein", "START Summit" → novel proper-noun runs
 *   "/opt/fleetcrown/runner/.env"              → novel path
 *
 * while the true parts ("Elena Weber SINGA Switzerland", "+41774730093") appear
 * verbatim in the records and pass clean.
 */
import { NOT_RECORDED, type Fact } from "./facts";

export type Violation = {
  kind: "unknown-citation" | "novel-proper-noun" | "novel-number" | "novel-path" | "uncited-claim";
  /** The offending text. */
  text: string;
  /** Why it is a problem, phrased for a repair prompt the model will read. */
  detail: string;
};

export type VerifyResult = {
  ok: boolean;
  violations: Violation[];
};

/**
 * Words that are capitalised for reasons other than being a proper noun, or
 * that are part of this system's own vocabulary. Kept deliberately small —
 * every entry is a hole in the check, so add only what demonstrably causes
 * false positives, never to silence a true one.
 */
const COMMON = new Set(
  [
    // Sentence/structural
    "the", "a", "an", "and", "or", "but", "if", "then", "so", "because", "not",
    "this", "that", "these", "those", "it", "its", "your", "you", "i", "we",
    "there", "here", "what", "which", "who", "when", "where", "why", "how",
    "no", "yes", "none", "nothing", "today", "tomorrow", "yesterday", "now",
    "next", "last", "first", "one", "two", "three", "primary", "focus", "task",
    "tasks", "outreach", "note", "notes", "summary", "status", "update",
    // Days / months — real words, never evidence of a fabricated entity
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    // This system's own nouns
    "loki", "cat", "fleetcrown", "orangecat", "not", "recorded",
  ].map((w) => w.toLowerCase()),
);

/** Normalise for containment tests: casefold, collapse punctuation and space. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Everything the model was legitimately given this turn: record values, record
 * subjects, and the user's own message (a name the user typed is fair to
 * repeat). This is the corpus a claim must be traceable to.
 */
function buildEvidence(facts: Fact[], userMessage: string, extra: string[]): string {
  const parts: string[] = [userMessage, ...extra];
  for (const f of facts) {
    parts.push(f.subject, f.kind, f.source);
    for (const v of Object.values(f.fields)) if (v) parts.push(v);
  }
  return norm(parts.join(" "));
}

/**
 * Lowercase words that legitimately sit INSIDE a proper name and must not break
 * it up: "University of Zurich", "Bank für Handel", "Institute for the Study of
 * Complexity". Without these, the run splits at the connector and the check
 * only ever sees the harmless halves ("University", "Zurich") while the actual
 * fabricated entity slips through unnamed.
 */
const NAME_CONNECTORS = new Set(["of", "the", "for", "and", "de", "der", "des", "van", "von", "du", "da", "di", "für", "el", "al"]);

/**
 * Named-entity candidates: ALL-CAPS acronyms, capitalised words, and the
 * multi-word runs they form (connectors allowed strictly between two
 * capitalised tokens, never at an edge).
 *
 * Both the run AND its individual tokens are emitted, deliberately. The run
 * catches composite inventions ("University of Zurich") that no single token
 * reveals; the individual tokens catch an invented acronym sitting next to a
 * real name ("Druzhnikov UZH"), where reporting only the run would name the
 * real person in the violation and produce a repair prompt that deletes the
 * true claim along with the false one.
 *
 * Sentence-initial single words are skipped — otherwise "Rotate the key" flags
 * "Rotate". That costs a little recall at sentence starts and removes the
 * dominant source of false positives; a fabricated name at a sentence start is
 * still caught by its remaining tokens.
 */
function properNounRuns(text: string): string[] {
  const out: string[] = [];
  // Strip fenced and inline code — quoted identifiers are usually the user's
  // own or a literal under discussion, not a claim about the world.
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

  for (const sentence of prose.split(/(?<=[.!?:\n])\s+/)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z0-9&.'’-]*/g) ?? [];
    let run: string[] = [];

    const flush = () => {
      // Trim trailing connectors so "University of" never stands as a run.
      while (run.length > 0 && NAME_CONNECTORS.has(run[run.length - 1].toLowerCase())) run.pop();
      if (run.length > 1) out.push(run.join(" "));
      run = [];
    };

    tokens.forEach((tok, i) => {
      const bare = tok.replace(/[.'’-]+$/, "");
      const isAcronym = /^[A-Z]{2,}$/.test(bare);
      const isCapitalised = /^[A-Z][a-z]/.test(bare);
      const isConnector = NAME_CONNECTORS.has(bare.toLowerCase());

      if (isAcronym || (isCapitalised && i > 0)) {
        run.push(bare);
        out.push(bare); // individually checkable
        return;
      }
      // A connector only continues a run that has already started.
      if (isConnector && run.length > 0) {
        run.push(bare);
        return;
      }
      flush();
    });
    flush();
  }
  return out;
}

/** Digit groups worth checking: phone numbers, years, percentages, counts ≥ 2 digits. */
function numericClaims(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  return (prose.match(/\+?\d[\d\s().-]{3,}\d|\b\d{2,}%?\b/g) ?? []).map((s) => s.trim());
}

/**
 * File and path references — a favourite fabrication, and an unusually
 * damaging one because naming a file implies the model READ it.
 *
 * Covers absolute paths (`/opt/fleetcrown/runner/.env`), relative paths
 * (`data/contact-resolver.json`), and bare filenames with a data/config
 * extension. The relative form matters: when challenged on the UZH claim, the
 * model "corrected" itself by asserting what `data/contact-resolver.json`
 * contained — a file it was never given. That reads as citing a source, which
 * is precisely why an unverified correction is more corrosive than the
 * original error: it spends the credibility the user was trying to restore.
 */
function pathClaims(text: string): string[] {
  const patterns = [
    /(?:^|[\s("'`])(\/[A-Za-z0-9_.\-/]{4,})/g, // absolute
    /(?:^|[\s("'`])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.\-/]*[A-Za-z0-9_-]\.[a-z]{2,5})/g, // relative w/ extension
    /(?:^|[\s("'`])([A-Za-z0-9_-]+\.(?:json|env|ya?ml|sql|toml|ini|conf|log))\b/g, // bare config filename
  ];
  const out = new Set<string>();
  for (const re of patterns) {
    for (const m of text.matchAll(re)) if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/**
 * Verify an answer against the facts it was supposed to come from.
 *
 * `extraEvidence` lets a caller admit sources outside the fact set — computed
 * directive output, a tool result the model legitimately saw this turn.
 * Anything not in facts, the user's message, or extraEvidence is unsupported
 * by construction.
 */
export function verifyAnswer(input: {
  answer: string;
  facts: Fact[];
  userMessage: string;
  extraEvidence?: string[];
}): VerifyResult {
  const { answer, facts, userMessage } = input;
  const evidence = buildEvidence(facts, userMessage, input.extraEvidence ?? []);
  const legalIds = new Set(facts.map((f) => f.id.toUpperCase()));
  const violations: Violation[] = [];

  // 1. Citations must resolve. A citation to a record that does not exist is
  //    the strongest possible signal of fabrication — it invents its own proof.
  for (const cite of answer.match(/\[F\d+\]/g) ?? []) {
    const id = cite.slice(1, -1).toUpperCase();
    if (!legalIds.has(id)) {
      violations.push({
        kind: "unknown-citation",
        text: cite,
        detail: `${cite} is not a record in this turn's context. Cite only ids that were provided, or say there is no record.`,
      });
    }
  }

  // 2. Named entities must be traceable. This is the anti-"UZH" rule.
  const seen = new Set<string>();
  for (const run of properNounRuns(answer)) {
    const n = norm(run);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    // Single common words are noise; multi-word runs always checked.
    const words = n.split(" ");
    if (words.length === 1 && (COMMON.has(words[0]) || words[0].length < 2)) continue;
    if (words.every((w) => COMMON.has(w))) continue;
    if (evidence.includes(n)) continue;
    // A multi-word run whose every word is individually attested is fine —
    // it is a rephrasing, not a new entity.
    if (words.length > 1 && words.every((w) => COMMON.has(w) || evidence.includes(w))) continue;
    violations.push({
      kind: "novel-proper-noun",
      text: run,
      detail: `"${run}" does not appear in any record or in the operator's message. If it is an organisation, role, or place you associated with someone, the relevant field is ${NOT_RECORDED} — remove the claim.`,
    });
  }

  // 3. Numbers must be traceable — invented phone numbers and dates read as
  //    authoritative precisely because they are specific.
  for (const num of numericClaims(answer)) {
    const n = norm(num);
    if (!n || n.length < 2) continue;
    if (evidence.includes(n)) continue;
    // Compare digits-only too: "+41 77 473 00 93" vs stored "+41774730093".
    const digits = num.replace(/\D/g, "");
    if (digits.length >= 4 && evidence.replace(/\D/g, "").includes(digits)) continue;
    if (digits.length < 4) continue; // small counts ("3 tasks") are rhetorical
    violations.push({
      kind: "novel-number",
      text: num,
      detail: `The number "${num}" is not in any record. Do not state contact details, dates, or metrics that were not provided.`,
    });
  }

  // 4. Paths — "update the key in /opt/fleetcrown/runner/.env" was invented
  //    wholesale, and its specificity is what made it convincing.
  for (const p of pathClaims(answer)) {
    if (evidence.includes(norm(p))) continue;
    violations.push({
      kind: "novel-path",
      text: p,
      detail: `The path "${p}" is not in any record. Do not state file locations you were not given.`,
    });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Turn violations into a repair instruction. One cheap retry with this appended
 * fixes most turns, because the model is not being asked to know more — only to
 * delete claims it cannot support.
 */
export function buildRepairPrompt(violations: Violation[], noBasisPhrase: string): string {
  return [
    "Your previous answer contained claims not supported by the records. Rewrite it.",
    "",
    ...violations.map((v) => `- ${v.detail}`),
    "",
    `Remove every unsupported claim. Where removing one empties a requested item, write "${noBasisPhrase}" for that item instead of substituting something else. Keep everything that was supported, unchanged.`,
  ].join("\n");
}

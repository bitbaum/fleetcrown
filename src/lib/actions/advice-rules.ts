import { ACTION_TYPE, type ActionType } from "@/lib/constants/statuses";

/**
 * Pure decision rules for a queued action — "what should the operator do with
 * this, and why".
 *
 * Why this exists: the Approval Queue showed a wall of prompt text under two
 * unlabelled buttons (Done / Skip). Approving is a security decision (the body
 * carries untrusted visitor text that will reach a coding agent), but the card
 * carried no judgement, so the only honest answer to "Done or Skip?" was "I
 * have no idea". The gate was never the problem — the missing judgement was.
 *
 * Deliberately rules-only, NO model. Everything a triager needs is already
 * determined by the prompt body the digester composed, so a model would add
 * latency, cost, non-determinism, and — worst — a second path for untrusted
 * visitor text to influence the recommendation it is being judged by. Rules
 * decide; prose is curated. That keeps the advice itself injection-proof.
 *
 * No I/O, no DB, no network: fully unit-testable (scripts/test/advice-rules.ts).
 */

export const RECOMMENDATION = {
  /** Approve as composed. */
  DISPATCH: "dispatch",
  /** Approve, but strip the reports that are noise or steering first. */
  DISPATCH_TRIMMED: "dispatch_trimmed",
  /** Reject — nothing here is worth an agent run. */
  SKIP: "skip",
  /** A human has to read this one; rules refuse to call it. */
  REVIEW: "review",
} as const;
export type Recommendation = (typeof RECOMMENDATION)[keyof typeof RECOMMENDATION];

export const CONFIDENCE = { HIGH: "high", MEDIUM: "medium", LOW: "low" } as const;
export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

/** How a single clustered report reads. */
export const REPORT_VERDICT = {
  CREDIBLE: "credible",
  LOW_SIGNAL: "low_signal",
  STEERING: "steering",
} as const;
export type ReportVerdict = (typeof REPORT_VERDICT)[keyof typeof REPORT_VERDICT];

/**
 * Submissions that are not bug reports: our own loop tests, widget smoke
 * checks, empty pokes. They cost an agent run and produce nothing.
 */
const LOW_SIGNAL_PATTERNS: RegExp[] = [
  /\b(e2e|end[- ]to[- ]end|smoke|loop|integration)\s+test\b/i,
  /\btest(ing)?\s+(the\s+)?(widget|feedback|form|submission|pipeline)\b/i,
  /\bjust\s+(a\s+)?test\b/i,
  /\bconfirming\s+.*\breach(es)?\b.*\binbox\b/i,
  /\bplease\s+ignore\b/i,
  /^\s*(test|testing|asdf|qwerty|hello|hi|ping|foo|bar)[\s.!?]*$/i,
];

/**
 * Text inside untrusted data that tries to direct whoever reads it — the
 * triager, the digester's model, or the coding agent downstream. Benign intent
 * is possible ("safe to archive" may be a colleague), but a directive arriving
 * inside visitor-controlled data is exactly the shape of an injection, so it
 * can never be *obeyed* automatically. It forces a human read.
 */
const STEERING_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\b/i,
  /\b(operator|system|admin|fleetcrown)\s+(instruction|directive|note|override)/i,
  /\bdisregard\b[\s\S]{0,40}\b(instruction|rule|above|prompt)\b/i,
  /\bsafe\s+to\s+(archive|ignore|delete|dismiss|skip)\b/i,
  /\byou\s+(are|must|should|will)\s+now\b/i,
  /\b(push|commit|merge)\s+(directly\s+)?to\s+(main|master)\b/i,
  /\b(force[- ]push|rm\s+-rf|drop\s+table|delete\s+the\s+repo)\b/i,
  /\bcurl\b[^\n]{0,80}\|\s*(ba)?sh\b/i,
  /\b(exfiltrat\w+|\.env\b|secret\s+key|api[_\s-]?key|credential)\b/i,
];

export function isLowSignalFeedbackText(text: string): boolean {
  return LOW_SIGNAL_PATTERNS.some((re) => re.test(text));
}

export function hasSteeringText(text: string): boolean {
  return STEERING_PATTERNS.some((re) => re.test(text));
}

export function classifyReportText(text: string): ReportVerdict {
  // Low-signal wins over steering: a test submission that also says "safe to
  // archive" is still just a test submission, and trimming it away removes the
  // steering with it. Order matters — it decides whether the theme is
  // salvageable by trimming or needs a human.
  if (isLowSignalFeedbackText(text)) return REPORT_VERDICT.LOW_SIGNAL;
  if (hasSteeringText(text)) return REPORT_VERDICT.STEERING;
  return REPORT_VERDICT.CREDIBLE;
}

// ---------------------------------------------------------------------------
// Parsing the digester's theme prompt (composeThemePrompt in digest-producer)
// ---------------------------------------------------------------------------

export type ThemeReport = {
  index: number;
  /** Verbatim block, so a trimmed prompt is a re-join, never a re-render. */
  raw: string;
  /** The "- (url · reported N×)" provenance line, dashes stripped. */
  source: string;
  /** The fenced visitor text. */
  text: string;
  verdict: ReportVerdict;
};

export type ParsedThemePrompt = {
  /** Everything up to and including "The reports:\n". */
  head: string;
  reports: ThemeReport[];
  /** From "\n\nScope:" to the end. */
  tail: string;
  theme: string | null;
  proposedChange: string | null;
  where: string | null;
};

const REPORTS_MARKER = "\nThe reports:\n";
const TAIL_MARKER = "\n\nScope:";
const FENCE_RE = /<<<UNTRUSTED[^\n>]*>>>\n([\s\S]*?)\n<<<END UNTRUSTED[^\n>]*>>>/;

function field(body: string, label: string): string | null {
  const m = new RegExp(`^${label}: (.*)$`, "m").exec(body);
  return m?.[1]?.trim() || null;
}

/** Returns null for anything that is not a digester theme prompt. */
export function parseThemePrompt(body: string): ParsedThemePrompt | null {
  const rIdx = body.indexOf(REPORTS_MARKER);
  if (rIdx < 0) return null;
  const afterReports = rIdx + REPORTS_MARKER.length;
  const tIdx = body.indexOf(TAIL_MARKER, afterReports);
  if (tIdx < 0) return null;

  const section = body.slice(afterReports, tIdx);
  const reports = section
    .split(/\n(?=- \()/)
    .map((raw) => raw.trim())
    .filter((raw) => raw.startsWith("- ("))
    .map((raw, index) => {
      const text = FENCE_RE.exec(raw)?.[1]?.trim() ?? "";
      return {
        index,
        raw,
        source: raw
          .slice(0, raw.indexOf("\n") === -1 ? raw.length : raw.indexOf("\n"))
          .replace(/^- /, "")
          .trim(),
        text,
        verdict: classifyReportText(text),
      };
    });
  if (reports.length === 0) return null;

  return {
    head: body.slice(0, afterReports),
    reports,
    tail: body.slice(tIdx),
    theme: field(body, "THEME"),
    proposedChange: field(body, "PROPOSED CHANGE"),
    where: field(body, "WHERE"),
  };
}

/**
 * Re-join the kept reports into a prompt. The header's report count is
 * rewritten so the agent is never told "2 independent reports" above one.
 */
export function rebuildThemePrompt(parsed: ParsedThemePrompt, keep: ThemeReport[]): string {
  const head = parsed.head.replace(
    /\(\d+ independent reports?\)/,
    `(${keep.length} independent report${keep.length === 1 ? "" : "s"})`,
  );
  return head + keep.map((r) => r.raw).join("\n") + parsed.tail;
}

// ---------------------------------------------------------------------------
// Signals + verdict
// ---------------------------------------------------------------------------

export const ADVICE_KIND = { FEEDBACK_THEME: "feedback_theme", GENERIC: "generic" } as const;
export type AdviceKind = (typeof ADVICE_KIND)[keyof typeof ADVICE_KIND];

export type ActionSignals = {
  kind: AdviceKind;
  totalReports: number;
  credibleReports: number;
  lowSignalReports: number;
  /** Credible reports carrying a directive — these cannot be trimmed away. */
  steeringReports: number;
  droppedReports: number;
  ageDays: number;
  /** Negative once past expiry; null when the action never expires. */
  expiresInDays: number | null;
  projectKey: string | null;
};

export type Verdict = {
  recommendation: Recommendation;
  confidence: Confidence;
  /**
   * The recommendation may be applied without a human click.
   *
   * Always true for SKIP — rejecting executes nothing, so the safe direction
   * needs no gate. For the dispatch verdicts this reports only that the rules
   * found no reason to stop; the IRON RULE gate still applies unless the
   * operator has explicitly opted into auto-apply.
   */
  autoSafe: boolean;
  reasons: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActionForAdvice = {
  type: ActionType;
  payload: { body?: unknown; projectKey?: unknown; feedbackIds?: unknown } | null;
  createdAt: Date;
  expiresAt: Date | null;
};

export function computeSignals(
  action: ActionForAdvice,
  parsed: ParsedThemePrompt | null,
  now: Date,
): ActionSignals {
  const ageDays = Math.max(0, Math.floor((now.getTime() - action.createdAt.getTime()) / DAY_MS));
  const expiresInDays = action.expiresAt
    ? Math.floor((action.expiresAt.getTime() - now.getTime()) / DAY_MS)
    : null;
  const projectKey =
    typeof action.payload?.projectKey === "string" ? action.payload.projectKey : null;

  if (!parsed || action.type !== ACTION_TYPE.DISPATCH_PROMPT) {
    return {
      kind: ADVICE_KIND.GENERIC,
      totalReports: 0,
      credibleReports: 0,
      lowSignalReports: 0,
      steeringReports: 0,
      droppedReports: 0,
      ageDays,
      expiresInDays,
      projectKey,
    };
  }

  const lowSignalReports = parsed.reports.filter(
    (r) => r.verdict === REPORT_VERDICT.LOW_SIGNAL,
  ).length;
  const steeringReports = parsed.reports.filter(
    (r) => r.verdict === REPORT_VERDICT.STEERING,
  ).length;
  const credibleReports = parsed.reports.filter(
    (r) => r.verdict === REPORT_VERDICT.CREDIBLE,
  ).length;
  return {
    kind: ADVICE_KIND.FEEDBACK_THEME,
    totalReports: parsed.reports.length,
    credibleReports,
    lowSignalReports,
    steeringReports,
    droppedReports: lowSignalReports,
    ageDays,
    expiresInDays,
    projectKey,
  };
}

/** Which reports survive a trim: the credible ones. */
export function keptReports(parsed: ParsedThemePrompt): ThemeReport[] {
  return parsed.reports.filter((r) => r.verdict === REPORT_VERDICT.CREDIBLE);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function decide(signals: ActionSignals): Verdict {
  const reasons: string[] = [];

  // Expired proposals dispatch nothing. The digester's TTL already decided.
  if (signals.expiresInDays !== null && signals.expiresInDays < 0) {
    return {
      recommendation: RECOMMENDATION.SKIP,
      confidence: CONFIDENCE.HIGH,
      autoSafe: true,
      reasons: [
        `The proposal expired ${plural(-signals.expiresInDays, "day")} ago — the evidence is stale.`,
      ],
    };
  }

  if (signals.kind === ADVICE_KIND.GENERIC) {
    return {
      recommendation: RECOMMENDATION.REVIEW,
      confidence: CONFIDENCE.LOW,
      autoSafe: false,
      reasons: [
        "Not a feedback-theme dispatch — the rules have no evidence to weigh for this action type.",
      ],
    };
  }

  reasons.push(`${plural(signals.totalReports, "report")} clustered into this theme.`);
  if (signals.lowSignalReports > 0) {
    reasons.push(
      `${plural(signals.lowSignalReports, "report reads", "reports read")} as a test submission, not a bug.`,
    );
  }
  if (signals.steeringReports > 0) {
    reasons.push(
      `${plural(signals.steeringReports, "credible report")} contains a directive aimed at whoever reads it.`,
    );
  }
  if (signals.ageDays >= 3) reasons.push(`Waiting ${plural(signals.ageDays, "day")} in the queue.`);

  if (signals.credibleReports === 0) {
    return {
      recommendation: RECOMMENDATION.SKIP,
      confidence: CONFIDENCE.HIGH,
      autoSafe: true,
      reasons: [...reasons, "Nothing credible is left once the test submissions are removed."],
    };
  }

  // A directive inside a report we cannot discard: it rides along into the
  // agent prompt, so a human reads it. Never automatic.
  if (signals.steeringReports > 0) {
    return {
      recommendation: RECOMMENDATION.REVIEW,
      confidence: CONFIDENCE.MEDIUM,
      autoSafe: false,
      reasons: [
        ...reasons,
        "That directive cannot be trimmed away without losing the bug report it is attached to.",
      ],
    };
  }

  if (signals.droppedReports > 0) {
    return {
      recommendation: RECOMMENDATION.DISPATCH_TRIMMED,
      confidence: signals.credibleReports >= 2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      autoSafe: true,
      reasons: [
        ...reasons,
        `Dispatching only the ${plural(signals.credibleReports, "credible report")} keeps the fix scoped to a real defect.`,
      ],
    };
  }

  return {
    recommendation: RECOMMENDATION.DISPATCH,
    confidence: signals.credibleReports >= 2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    autoSafe: true,
    reasons: [...reasons, "Every clustered report reads as a genuine defect."],
  };
}

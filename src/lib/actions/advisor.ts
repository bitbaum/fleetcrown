import { OPERATING_PRINCIPLES } from "@/config/operating-principles";
import {
  ADVICE_KIND,
  CONFIDENCE,
  RECOMMENDATION,
  REPORT_VERDICT,
  computeSignals,
  decide,
  keptReports,
  parseThemePrompt,
  rebuildThemePrompt,
  type ActionForAdvice,
  type ActionSignals,
  type Confidence,
  type Recommendation,
  type ReportVerdict,
  type Verdict,
} from "./advice-rules";

/**
 * Turns a queued action into a decision the operator can take in one click:
 * a recommendation, the evidence behind it, what will actually happen, the
 * alternatives, and one line of perspective.
 *
 * Assembly only — every judgement comes from advice-rules (pure, no model).
 * Prose is curated here rather than generated, so the advice cannot be steered
 * by the untrusted text it is describing.
 */

/** Look a principle up by its prefix so a reorder in the SSOT can't silently
 *  swap which principle a piece of advice cites. */
function principle(prefix: string): string {
  return OPERATING_PRINCIPLES.find((p) => p.startsWith(prefix)) ?? prefix;
}

export type AdviceReport = {
  source: string;
  excerpt: string;
  verdict: ReportVerdict;
  /** Plain-language reason this report is tagged the way it is. */
  note: string;
};

export type AdviceOption = {
  id: Recommendation;
  label: string;
  detail: string;
  recommended: boolean;
  /** True when choosing this executes something (vs. closing the popup). */
  destructive: boolean;
};

export type ActionAdvice = {
  actionId: string;
  title: string;
  projectKey: string | null;
  recommendation: Recommendation;
  confidence: Confidence;
  autoSafe: boolean;
  headline: string;
  background: string;
  whatHappens: string;
  why: string[];
  signals: ActionSignals;
  reports: AdviceReport[];
  options: AdviceOption[];
  perspective: { principle: string; note: string };
};

const EXCERPT_MAX = 180;

const REPORT_NOTES: Record<ReportVerdict, string> = {
  [REPORT_VERDICT.CREDIBLE]: "Reads as a real defect report.",
  [REPORT_VERDICT.LOW_SIGNAL]: "Reads as one of our own test submissions, not a bug.",
  [REPORT_VERDICT.STEERING]: "Contains an instruction aimed at whoever reads it — treated as data, never obeyed.",
};

/**
 * Perspective, curated per verdict. Not decoration: each one names the reason
 * this decision is worth two seconds of attention rather than none.
 */
const PERSPECTIVE: Record<Recommendation, { principlePrefix: string; note: string }> = {
  [RECOMMENDATION.DISPATCH]: {
    principlePrefix: "Correctness over speed",
    note:
      "Two strangers hitting the same wall is the cheapest signal you will ever get — nobody files a second report on a problem that does not exist. This is the one class of work where the evidence arrives before the cost.",
  },
  [RECOMMENDATION.DISPATCH_TRIMMED]: {
    principlePrefix: "First principles",
    note:
      "A cluster is a guess, not a fact. When one member is our own test traffic, the theme is two different things wearing one label — and an agent handed both will widen its scope to cover the noise. Cutting the cluster down is cheaper than reviewing what a confused agent writes.",
  },
  [RECOMMENDATION.SKIP]: {
    principlePrefix: "KISS",
    note:
      "A queue that never empties is a queue you stop reading, and then the one real report in it goes unread too. Clearing noise is not housekeeping — it is what keeps the queue worth opening at all.",
  },
  [RECOMMENDATION.REVIEW]: {
    principlePrefix: "Validate at boundaries",
    note:
      "Something inside visitor-controlled text is telling you what to do with it. That is not automatically an attack — but a directive that arrives inside data is never evidence about itself, and the moment you let it decide, whoever writes the data decides. Read it, then you choose.",
  },
};

function headlineFor(verdict: Verdict, signals: ActionSignals, project: string): string {
  const p = project || "the project";
  switch (verdict.recommendation) {
    case RECOMMENDATION.DISPATCH:
      return `Dispatch it — ${signals.credibleReports} independent reports, no noise.`;
    case RECOMMENDATION.DISPATCH_TRIMMED:
      return `Dispatch the ${signals.credibleReports === 1 ? "one real report" : `${signals.credibleReports} real reports`}, drop ${signals.droppedReports === 1 ? "the test submission" : `${signals.droppedReports} test submissions`}.`;
    case RECOMMENDATION.SKIP:
      return signals.kind === ADVICE_KIND.GENERIC
        ? "Skip — this proposal has gone stale."
        : "Skip — none of this is a real report.";
    case RECOMMENDATION.REVIEW:
      return `Read this one yourself before it reaches ${p}.`;
  }
}

function backgroundFor(
  verdict: Verdict,
  signals: ActionSignals,
  parsed: ReturnType<typeof parseThemePrompt>,
  project: string,
): string {
  if (signals.kind === ADVICE_KIND.GENERIC) {
    return "This is not a visitor-feedback dispatch, so the advisor has no clustered evidence to weigh. It reads the proposal's age and expiry only — the content is yours to judge.";
  }
  const theme = parsed?.theme ? `"${parsed.theme}"` : "a theme";
  // The digester's proposedChange is model-written and rarely punctuated —
  // terminate it so the sentence that follows does not run on.
  const change = parsed?.proposedChange
    ? ` It proposes: ${parsed.proposedChange.replace(/[.!?]?$/, ".")}`
    : "";
  const noise =
    signals.lowSignalReports > 0
      ? ` One thing the clustering could not know: ${signals.lowSignalReports} of them ${signals.lowSignalReports === 1 ? "is" : "are"} our own test traffic, which inflates the "independent reports" count that made this a theme in the first place.`
      : "";
  return (
    `The feedback digester grouped ${signals.totalReports} visitor submissions on ${project} under ${theme} ` +
    `and pre-wrote the agent prompt below.${change}${noise}`
  );
}

function whatHappensFor(verdict: Verdict, signals: ActionSignals, project: string): string {
  const p = project || "the project";
  switch (verdict.recommendation) {
    case RECOMMENDATION.DISPATCH:
      return `The prompt is sent to ${p} as an agent run. The ${signals.totalReports} clustered feedback rows flip to "dispatched", and close-the-loop resolves them — emailing anyone who left an address — when the run finishes green.`;
    case RECOMMENDATION.DISPATCH_TRIMMED:
      return `A rewritten prompt carrying only the ${signals.credibleReports} credible report${signals.credibleReports === 1 ? "" : "s"} is sent to ${p}. The ${signals.droppedReports} dropped row${signals.droppedReports === 1 ? " is" : "s are"} archived so the digester stops re-clustering ${signals.droppedReports === 1 ? "it" : "them"} into next week's proposal.`;
    case RECOMMENDATION.SKIP:
      return signals.totalReports > 0
        ? `Nothing runs. The proposal is rejected and its ${signals.totalReports} feedback rows are archived, so this does not come back tomorrow as the same card.`
        : "Nothing runs. The proposal is rejected.";
    case RECOMMENDATION.REVIEW:
      return "Nothing happens yet. Read the flagged report below, then dispatch it, trim it, or skip it — the buttons stay right here.";
  }
}

function optionsFor(verdict: Verdict, signals: ActionSignals): AdviceOption[] {
  const canTrim = signals.credibleReports > 0 && signals.droppedReports > 0;
  const all: AdviceOption[] = [
    {
      id: RECOMMENDATION.DISPATCH,
      label: "Dispatch as written",
      detail: `Send all ${signals.totalReports || "the"} report${signals.totalReports === 1 ? "" : "s"} to the agent unchanged.`,
      recommended: false,
      destructive: true,
    },
    {
      id: RECOMMENDATION.DISPATCH_TRIMMED,
      label: `Dispatch only the credible ${signals.credibleReports === 1 ? "report" : `${signals.credibleReports} reports`}`,
      detail: "Strip the test submissions, archive them, then send the rest.",
      recommended: false,
      destructive: true,
    },
    {
      id: RECOMMENDATION.SKIP,
      label: "Skip and archive",
      detail: "Reject the proposal and clear its feedback rows.",
      recommended: false,
      destructive: true,
    },
    {
      id: RECOMMENDATION.REVIEW,
      label: "Leave it for now",
      detail: "Close this popup; the action stays in the queue.",
      recommended: false,
      destructive: false,
    },
  ].filter((o) => (o.id === RECOMMENDATION.DISPATCH_TRIMMED ? canTrim : true));

  for (const o of all) o.recommended = o.id === verdict.recommendation;
  // Recommended first — the popup renders options in order and the primary
  // button is index 0, so ordering is the recommendation.
  return [...all].sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export type AdviceInput = ActionForAdvice & { id: string; title: string };

export function adviseAction(action: AdviceInput, now: Date = new Date()): ActionAdvice {
  const body = typeof action.payload?.body === "string" ? action.payload.body : "";
  const parsed = body ? parseThemePrompt(body) : null;
  const signals = computeSignals(action, parsed, now);
  const verdict = decide(signals);
  const project = signals.projectKey ?? "";

  const persp = PERSPECTIVE[verdict.recommendation];

  return {
    actionId: action.id,
    title: action.title,
    projectKey: signals.projectKey,
    recommendation: verdict.recommendation,
    confidence: verdict.confidence,
    autoSafe: verdict.autoSafe,
    headline: headlineFor(verdict, signals, project),
    background: backgroundFor(verdict, signals, parsed, project || "this project"),
    whatHappens: whatHappensFor(verdict, signals, project),
    why: verdict.reasons,
    signals,
    reports: (parsed?.reports ?? []).map((r) => ({
      source: r.source,
      excerpt: r.text.length > EXCERPT_MAX ? `${r.text.slice(0, EXCERPT_MAX)}…` : r.text,
      verdict: r.verdict,
      note: REPORT_NOTES[r.verdict],
    })),
    options: optionsFor(verdict, signals),
    perspective: { principle: principle(persp.principlePrefix), note: persp.note },
  };
}

/**
 * The payload a trimmed dispatch should carry: the prompt rebuilt from the
 * credible reports only, the feedback ids that survive, and the ids to archive.
 *
 * feedbackIds are written by the digester in the same order the reports are
 * rendered, so index alignment holds. When it does not (hand-edited payload,
 * older row), the trim refuses rather than archiving the wrong rows.
 */
export type TrimPlan = { body: string; keepFeedbackIds: string[]; dropFeedbackIds: string[] };

export function planTrim(action: AdviceInput): TrimPlan | null {
  const body = typeof action.payload?.body === "string" ? action.payload.body : "";
  const parsed = body ? parseThemePrompt(body) : null;
  if (!parsed) return null;

  const keep = keptReports(parsed);
  if (keep.length === 0 || keep.length === parsed.reports.length) return null;

  const ids = Array.isArray(action.payload?.feedbackIds)
    ? (action.payload.feedbackIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const aligned = ids.length === parsed.reports.length;
  const keepIdx = new Set(keep.map((r) => r.index));

  return {
    body: rebuildThemePrompt(parsed, keep),
    keepFeedbackIds: aligned ? ids.filter((_, i) => keepIdx.has(i)) : ids,
    dropFeedbackIds: aligned ? ids.filter((_, i) => !keepIdx.has(i)) : [],
  };
}

export { RECOMMENDATION, CONFIDENCE, REPORT_VERDICT, ADVICE_KIND };
export type { Recommendation, Confidence, ReportVerdict, ActionSignals };

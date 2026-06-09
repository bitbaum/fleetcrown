/**
 * SSOT for project control-surface states.
 *
 * Every consumer of project state (badge, chip, summary counter, Zellij row,
 * agent context, hover tooltip, dot color, click-action hint) reads from this
 * file. Adding or removing a state requires editing exactly one literal — the
 * compiler then forces every Record below to remain exhaustive, so drift is
 * structurally impossible.
 *
 * Truth discipline:
 *  - `label` is what the user sees. Short, honest, action-implying.
 *  - `description` is the one-line WHY (also shipped to agent prompt context),
 *    so the agent reads the same words the human reads. No paraphrasing.
 *  - `problem` is non-null only when the state itself signals "this needs
 *    your attention" — the UI surfaces it as a tooltip + an actionable hint.
 *  - `counterCategory` is what the summary chip reads. Two states pointing at
 *    the same category is allowed (e.g. ready + orchestration_ready both
 *    count as "waiting"); the categories themselves are the SSOT for chip
 *    arithmetic so the row badge and the chip can never disagree.
 *
 * Add a state? You only need to:
 *  1. Append to PROJECT_STATES
 *  2. The compiler will tell you which Records below to fill
 *  3. Add the derivation rule in deriveProjectState() (lib/derive-project-state.ts)
 */

export const PROJECT_STATES = [
  "offline",              // Daemon has not pushed state — we genuinely don't know.
  "not_running",          // No agent process and no tab — nothing exists for this project.
  "tab_open",             // Zellij tab open, no agent process detected in it.
  "open_idle",            // Agent process detected, no recent lifecycle signal — likely at prompt.
  "working",              // Agent mid-turn (lock sentinel fresh OR current prompt active).
  "ready",                // Stop hook fired recently — agent just handed off.
  "orchestration_ready",  // Latest orchestration run completed recently.
  "closing",              // Closing hook fired — agent is shutting down.
  "completed",            // Closed hook fired — agent finished cleanly.
] as const;

export type ProjectStateKey = (typeof PROJECT_STATES)[number];

/** Buckets the summary chip counts into. Decoupled from state keys so two
 *  states (ready + orchestration_ready) can both count as "waiting" without
 *  the row badge having to say the same word. */
export type ProjectCounterCategory =
  | "working"   // chip: "X working"
  | "waiting"   // chip: "Y awaiting input" — covers ready + orchestration_ready + open_idle
  | "idle"      // chip: "Z idle" — not running, tab-only, completed
  | "offline";  // chip: "W offline"

export type ProjectStateDefinition = {
  /** Badge text. Short, honest, action-implying. */
  label: string;
  /** One-line WHY this state is currently true. Shipped verbatim to agent
   *  prompt context (so the agent sees the same words the human sees). */
  description: string;
  /** Tailwind class for the status dot. Limited to a 4-color palette
   *  (positive / accent-active / warning / muted) — see palette comment. */
  dotClass: string;
  /** Tailwind class for the badge tag chip. */
  tagClass: string;
  /** Which summary-chip bucket this state contributes to. */
  counterCategory: ProjectCounterCategory;
  /** When the state itself indicates the user must act, this is the
   *  remediation hint surfaced in tooltip + action chip. Null = no problem. */
  problem: { hint: string; ctaLabel?: string; ctaHref?: string } | null;
};

/* ── Color palette discipline ────────────────────────────────────────────────
 *
 * Four meanings, four colors. The user complaint was "gray, green, brown,
 * whatever" — the fix is to keep the palette finite and tie each color to a
 * clear semantic:
 *
 *   accent-primary (blue) + pulse  → ONE thing only: agent actively executing.
 *                                    Earns the eye-pull because it's the only
 *                                    state where the agent is mid-turn.
 *   status-positive (green)        → "Good thing just happened" — handoff,
 *                                    orchestration complete, clean exit.
 *   status-warning (amber)         → "User must act" — daemon offline.
 *   border-default (muted gray)    → "Inert, nothing happening" — collapses
 *                                    the former gray/brown/border-strong mix
 *                                    into one honest non-color. open_idle +
 *                                    not_running + tab_open + closing all
 *                                    read the same because they're all
 *                                    "ambient, no event, no action needed".
 *
 * If you want to introduce a fifth color, add a meaning the existing four
 * cannot honestly express — don't introduce a hue for a nuance.
 */

export const STATE_DEFINITIONS: Record<ProjectStateKey, ProjectStateDefinition> = {
  offline: {
    label: "Offline",
    description: "Daemon has not pushed state recently. We don't know what's actually happening on the agent host.",
    dotClass: "bg-status-warning",
    tagClass: "ui-tag ui-tag-warning",
    counterCategory: "offline",
    problem: {
      hint: "Daemon offline. Start Fleet Runner, or run `bash scripts/home-start.sh` in the project directory.",
      ctaLabel: "Install Fleet Runner",
      ctaHref: "/download",
    },
  },
  not_running: {
    label: "Not running",
    description: "No agent process and no terminal tab detected for this project.",
    dotClass: "bg-border-default",
    tagClass: "ui-tag ui-tag-neutral",
    counterCategory: "idle",
    problem: null,
  },
  tab_open: {
    label: "Tab open",
    description: "Terminal workspace exists for this project but no agent process is running in it.",
    dotClass: "bg-border-default",
    tagClass: "ui-tag ui-tag-neutral",
    counterCategory: "idle",
    problem: null,
  },
  open_idle: {
    label: "Awaiting input",
    description: "Agent process detected but no recent lifecycle signal — Claude is at the prompt waiting for your next message.",
    dotClass: "bg-border-default",
    tagClass: "ui-tag ui-tag-neutral",
    counterCategory: "waiting",
    problem: null,
  },
  working: {
    label: "Working",
    description: "Agent is mid-turn — actively reading files, calling tools, or writing.",
    dotClass: "bg-accent-primary animate-pulse",
    tagClass: "ui-tag ui-tag-accent",
    counterCategory: "working",
    problem: null,
  },
  ready: {
    label: "Ready for next step",
    description: "Stop hook fired recently — the agent finished a turn and is ready for the next instruction. The handoff lists the suggested next move.",
    dotClass: "bg-status-positive",
    tagClass: "ui-tag ui-tag-positive",
    counterCategory: "waiting",
    problem: null,
  },
  orchestration_ready: {
    label: "Ready for next step",
    description: "Latest orchestration run completed and produced a result. Pick the next intent or accept the suggested next-best.",
    dotClass: "bg-status-positive",
    tagClass: "ui-tag ui-tag-positive",
    counterCategory: "waiting",
    problem: null,
  },
  closing: {
    label: "Closing",
    description: "Closing hook fired — the agent process is shutting down.",
    dotClass: "bg-border-default",
    tagClass: "ui-tag ui-tag-neutral",
    counterCategory: "idle",
    problem: null,
  },
  completed: {
    label: "Completed",
    description: "Closed hook fired — the agent exited cleanly.",
    dotClass: "bg-status-positive",
    tagClass: "ui-tag ui-tag-positive",
    counterCategory: "idle",
    problem: null,
  },
};

/* ── Lookup helpers ──────────────────────────────────────────────────────────
 *
 * Every consumer goes through one of these — no direct dictionary indexing
 * elsewhere. Adding a memoization layer or a logging layer later means
 * editing exactly these three functions.
 */

export function projectStateLabel(key: ProjectStateKey): string {
  return STATE_DEFINITIONS[key].label;
}

export function projectStateDotClass(key: ProjectStateKey): string {
  return STATE_DEFINITIONS[key].dotClass;
}

/** The descriptive sentence — shipped both as the hover tooltip and as
 *  the prompt-context line so the human and the agent read the same words. */
export function projectStateDescription(key: ProjectStateKey): string {
  return STATE_DEFINITIONS[key].description;
}

/** Returns the actionable hint when the state itself signals a problem
 *  (e.g. "Offline" → "start the daemon"). UI components surface this as
 *  a tooltip + a one-click action chip. */
export function projectStateProblem(
  key: ProjectStateKey,
): ProjectStateDefinition["problem"] {
  return STATE_DEFINITIONS[key].problem;
}

/** Counter bucket the summary chip reads. The chip arithmetic ("X working ·
 *  Y awaiting input") MUST use this — it's the only way the badge and the
 *  chip can stay in sync as states are added or refined. */
export function projectStateCounterCategory(
  key: ProjectStateKey,
): ProjectCounterCategory {
  return STATE_DEFINITIONS[key].counterCategory;
}

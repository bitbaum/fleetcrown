import { APP_NAME } from "./brand";

export const LANDING_BADGE = "Personal AI workspace";
export const LANDING_HEADLINE = ["Command your", "AI fleet."] as const;
export const LANDING_SUBTITLE = "Add projects. Launch agents. Track progress. Keep the work visible in one place.";
export const LANDING_FOOTER = "PROJECTS · AGENTS · HABITS · GOALS · SYSTEMS";
export const LANDING_WHITEPAPER_LABEL = "Read the whitepaper";

export const LANDING_FEATURES = [
  {
    icon: "⊞",
    title: "Fleet view",
    body: "See active projects and agent sessions together so work does not disappear into separate tools or tabs.",
  },
  {
    icon: "⚡",
    title: "Continuation loop",
    body: `When a session pauses, ${APP_NAME} can surface the next decision instead of leaving it buried in a terminal tab.`,
  },
  {
    icon: "◎",
    title: "Shared operating surface",
    body: "Projects, goals, habits, people, and systems can be reviewed from the same interface instead of separate disconnected tools.",
  },
] as const;

export const LANDING_PRICING = [
  {
    name: "Personal",
    monthly: 12,
    annual: 99,
    tagline: "Solo builders, up to 5 projects.",
    cta: "Get started",
    highlighted: false,
    features: [
      "Up to 5 active projects",
      "Fleet command center",
      "Agent injection & auto-continue",
      "Remote access via daemon bridge",
      "Goals, habits & life OS",
      "Prompt queue & voice input",
    ],
  },
  {
    name: "Pro",
    monthly: 29,
    annual: 249,
    tagline: "Power builders, unlimited projects.",
    cta: "Start Pro",
    highlighted: true,
    features: [
      "Unlimited projects",
      "Everything in Personal",
      "Faster dispatch inference",
      "Extended prompt history (90 days)",
      "Priority support",
      "Early access to new features",
    ],
  },
  {
    name: "Team",
    monthly: 79,
    annual: 699,
    tagline: "Small groups sharing a fleet (up to 10).",
    cta: "Start Team",
    highlighted: false,
    features: [
      "Up to 10 team members",
      "Everything in Pro",
      "Shared project fleet",
      "Multi-user prompt queues",
      "Team dashboards",
      "Per-member agent preferences",
    ],
  },
] as const;

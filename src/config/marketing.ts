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
    body: "When a session pauses, Cockpit can surface the next decision instead of leaving it buried in a terminal tab.",
  },
  {
    icon: "◎",
    title: "Shared operating surface",
    body: "Projects, goals, habits, people, and systems can be reviewed from the same interface instead of separate disconnected tools.",
  },
] as const;

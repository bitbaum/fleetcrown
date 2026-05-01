export type ThoughtArticleSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type ThoughtArticle = {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  featured?: boolean;
  author: string;
  readingTimeMin: number;
  sections: ThoughtArticleSection[];
};

export const THOUGHTS_ARTICLES: ThoughtArticle[] = [
  {
    slug: "how-the-loop-was-born-and-why-it-works",
    title: "How the Loop Was Born, and Why It Actually Moves Projects",
    summary:
      "A detailed origin story of the autonomous project loop: from tab-level prompting to orchestration, and why it compounds delivery speed.",
    excerpt:
      "How we moved from fragmented project context-switching to a compounding execution loop that preserves momentum across repos.",
    publishedAt: "2026-04-29",
    tags: ["origin", "product", "workflow", "execution"],
    featured: true,
    author: "Ivy",
    readingTimeMin: 8,
    sections: [
      { heading: "The Original Pain", paragraphs: ["The bottleneck was never writing code. The bottleneck was deciding what to do next, repeatedly, across many active projects. Every context switch cost momentum.", "Without a forcing function, projects drifted into local optimizations: polishing low-impact details while urgent structural work stayed unresolved."] },
      { heading: "The First Working Version", paragraphs: ["The first useful version was simple: keep each project in its own terminal tab, inject a scoped prompt, wait for completion, then immediately choose the next prompt. This removed startup friction from each work cycle.", "The big unlock was the countdown popup after completion. Instead of pausing into indecision, the system offered a default continuation path and auto-ran it unless manually overridden."] },
      { heading: "Why This Compounds", paragraphs: ["It compounds because decision overhead collapses. The system converts long sessions of manual triage into short intervention points.", "When the loop works, each run leaves a handoff summary, then the next run starts from that state. This preserves direction across interruptions and keeps work moving forward with less cognitive tax."], bullets: ["Less idle time between tasks", "Fewer forgotten follow-ups", "Higher consistency in verification and handoff quality", "Clearer visibility of project health across many repos"] },
      { heading: "What It Became", paragraphs: ["It evolved from a prompt launcher into a coordination layer: prompt intents, session state, lifecycle signals, and UI interventions in one control surface.", "The remaining gap is neutrality. Today, lifecycle depth is strongest in Claude mode. The architecture goal is to keep the same operating model while swapping execution backends freely."] },
      { heading: "What This Changes for Portfolio Throughput", paragraphs: ["For one project, this loop feels like acceleration. For ten projects, it becomes a survivability mechanism. It ensures meaningful progress continues even when attention is fragmented.", "The strategic value is simple: less planning theater, more completed work with explicit next steps."] },
    ],
  },
  {
    slug: "next-best-step-the-prompt-that-drives-everything",
    title: "Next Best Step: The Prompt That Drives Everything Forward",
    summary:
      "A deep breakdown of the prompt intent that keeps projects out of drift by forcing highest-impact execution in each cycle.",
    excerpt:
      "Why one default prompt intent can outperform ad-hoc planning and keep project portfolios progressing under uncertainty.",
    publishedAt: "2026-04-29",
    tags: ["prompts", "next-best", "orchestration", "delivery"],
    author: "Ivy",
    readingTimeMin: 9,
    sections: [
      { heading: "What Next Best Step Is", paragraphs: ["Next Best Step is a prioritization-and-execution prompt intent. It does not ask for random progress. It asks for the highest-impact actionable move right now, then executes it fully.", "Its purpose is to prevent two failure modes: endless analysis and low-value busy work."] },
      { heading: "Decision Order", paragraphs: ["The intent follows a strict order before choosing work."], bullets: ["Resume interrupted or uncommitted work first", "Fix failing tests or broken flows second", "Address SSOT/DRY/quality violations third", "Resolve mission/product misalignment fourth"] },
      { heading: "Execution Contract", paragraphs: ["After selecting the highest-impact item, the prompt requires full execution unless blocked. It rejects partial progress narratives as a completion substitute.", "It also requires a verification gate: typecheck, build, tests, browser inspection, or equivalent smallest meaningful proof."] },
      { heading: "Handoff Format", paragraphs: ["Each run must end with structured handoff lines. This is what keeps continuity across autonomous cycles and human interruptions."], bullets: ["done: one sentence of completed work", "next: one sentence of highest-impact remaining work", "tests: pass/fail snapshot", "todos: concise count/state", "health: good / needs attention / critical"] },
    ],
  },
  {
    slug: "from-claude-centric-to-neutral-orchestration",
    title: "From Claude-Centric to Neutral Orchestration",
    summary:
      "Why Cockpit must move from backend-specific hooks to one neutral lifecycle contract across Claude and OpenClaw/Codex.",
    excerpt:
      "The architecture migration plan to decouple orchestration UX from any single coding backend.",
    publishedAt: "2026-04-29",
    tags: ["architecture", "ssot", "orchestration", "ux"],
    author: "Ivy",
    readingTimeMin: 7,
    sections: [
      { heading: "Problem", paragraphs: ["The current autonomous development loop works best with Claude because lifecycle signals and stop hooks are Claude-specific. This creates vendor lock-in at the exact layer that should stay neutral.", "When Claude tokens are unavailable, the quality of orchestration drops even though OpenClaw and Codex can execute equivalent work."] },
      { heading: "Target State", paragraphs: ["One prompt SSOT. One lifecycle SSOT. Multiple execution adapters.", "Claude, OpenClaw, and Codex should be swappable runners under a shared contract without changing Control UI behavior."], bullets: ["Prompt intents are backend-agnostic", "Lifecycle states are backend-agnostic (running, ready, closing, closed)", "UI popup/countdown behavior is reused across adapters"] },
      { heading: "Implementation Direction", paragraphs: ["Introduce a neutral runner contract and map existing Claude hooks into that contract.", "Add OpenClaw adapter parity so done/ready events trigger the same next-step popup and countdown."] },
    ],
  },
];

export function listThoughtArticles(): ThoughtArticle[] {
  return [...THOUGHTS_ARTICLES].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getThoughtArticle(slug: string): ThoughtArticle | null {
  return THOUGHTS_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function getAdjacentThoughts(slug: string): { previous: ThoughtArticle | null; next: ThoughtArticle | null } {
  const sorted = listThoughtArticles();
  const index = sorted.findIndex((article) => article.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: sorted[index + 1] ?? null,
    next: sorted[index - 1] ?? null,
  };
}

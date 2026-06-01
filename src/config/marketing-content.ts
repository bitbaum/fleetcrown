import { APP_NAME, MARKETING_TAGLINE, MARKETING_SUBTITLE, MARKETING_POSITIONING } from "./brand";

// Central source of truth for all public marketing copy.
// Rebrand, reposition, or A/B test by editing this file — no component changes.

export const SITE_TITLE = `${APP_NAME} — Local AI Agent Fleet Control`;
export const SITE_DESCRIPTION = "The operating system for people running real AI agents. Local execution where the work happens. Remote command from anywhere.";

// Homepage hero
export const HOME_HERO = {
  badge: MARKETING_POSITIONING,
  headline: [MARKETING_TAGLINE, ""],
  subheadline: MARKETING_SUBTITLE,
};

// Differentiation
export const DIFFERENTIATION = {
  title: "Not another coding agent.",
  subtitle: "Most tools help you write code faster in one file or one project. We help serious builders orchestrate real agent operations at fleet scale.",
  points: [
    {
      title: "Local execution is the foundation",
      body: "Your agents run on your machines with full access to your environment. We do not force everything through remote sandboxes.",
    },
    {
      title: "Fleet orchestration, not single-agent assistance",
      body: "Built for people already running many agents across many projects. Explicit per-project autonomy levels instead of one generic assistant.",
    },
    {
      title: "Local runner + web command center",
      body: "The desktop application executes. The web portal gives you fleet visibility and remote control. Two surfaces, one system.",
    },
  ],
};

// Mission — one striking statement, minimal elaboration
export const MISSION = {
  eyebrow: "WHY WE EXIST",
  title: "Mission",
  statement: "Direct the creation of everything you can imagine.",
  paragraphs: [
    "We are building the control plane for the age of autonomous creation. Today, one person commands a fleet of AI agents building software. Tomorrow, the same person commands fleets of robots building the physical world.",
    "The leverage shifts from companies to individuals. The bottleneck moves from raw capability to human direction.",
    "We are deliberately building in support for open and local models. The future of creation will not be gated behind closed frontier subscriptions.",
  ],
};

// Philosophy — short, declarative maxims with concrete reasoning
export const PHILOSOPHY = {
  eyebrow: "PRINCIPLES",
  title: "Principles",
  lede: "The constraints we use when building the control layer for the age of autonomous creation — from software agents today to robot fleets in the future.",
  values: [
    {
      name: "Local first. Always.",
      description: "Your machine is the privileged execution surface. When it can do the work, it should. Full environment access. Zero cloud sandbox compromise.",
    },
    {
      name: "Humans in the loop, by default.",
      description: "You decide how much the system decides. Per project. Per moment. Autonomy is a dial — not a switch you flip once and forget.",
    },
    {
      name: "Software today. Robots tomorrow.",
      description: "The same control patterns that orchestrate agents will orchestrate robots. We are building the abstraction layer for both.",
    },
    {
      name: "Open models, first class.",
      description: "Frontier subscriptions are not the destination. Open and local models compete equally for your attention and your work.",
    },
    {
      name: "Nothing hidden.",
      description: "You always know what each agent is doing and why. No black boxes inside your own fleet.",
    },
    {
      name: "Built for serious operators.",
      description: "Cockpit is infrastructure for builders running many agents at once across multiple projects — not a friendly chat assistant.",
    },
  ],
  closer: "These are not slogans. They are the constraints we use when making product and engineering decisions.",
};

// Investors — sharp thesis, declarative bullets
export const INVESTORS = {
  eyebrow: "FOR INVESTORS",
  headline: "The control layer for the age of autonomous creation.",
  thesis: "One person commanding a fleet of agents is the new unit of leverage. We are building the operating system for that future — and for the robotic fleets that will follow.",
  whyNow: [
    "Agent capability has crossed the orchestration threshold. The bottleneck is no longer raw generation. It is human direction.",
    "The most advanced users are already running many agents at once across multiple projects. They need infrastructure built for that reality.",
    "The winning architecture — local execution plus remote command — is now visible. We are building the most refined version of it.",
    "Open and local models are converging on frontier capability. Whoever controls the orchestration layer will be neutral to model choice.",
    "The same control patterns transfer to physical robotics. The market has not yet appreciated this.",
  ],
  built: "A web command center coordinates fleets of AI agents across projects. A local execution layer runs them directly in the operator's terminal environment. Per-project autonomy controls, reliable handoff systems, queue management, and truthful status surfaces are live and in daily use.",
  traction: "Sophisticated power users run multi-project agent operations daily. Demand for finer autonomy controls, fleet visibility, and freedom from single-vendor frontier subscriptions is consistent and growing.",
  ask: "We are raising to productize the local fleet runner, harden the remote control plane, expand open-model support, and lay groundwork for robotic orchestration.",
};

export const INVESTOR_DETAILS = {
  deck: "Available upon request",
  contact: "investors@cockpitapp.com",
};

// Roadmap — three phases, declarative
export const ROADMAP = {
  eyebrow: "PRODUCT DIRECTION",
  title: "Roadmap",
  lede: "Building the operating system for people running serious AI agent operations — and for the robotic fleets that come next.",
  phases: [
    {
      marker: "NOW",
      title: "Foundation",
      paragraphs: [
        "The web command center is live. It coordinates fleets of AI agents across projects with per-project autonomy, prompt queues, handoff systems, and truthful status surfaces.",
        "A local execution layer runs agents directly inside the operator's terminal environment — Zellij plus Claude, Grok, Codex, and the rest.",
        "The architecture is proven. The next phase is consolidation.",
      ],
    },
    {
      marker: "NEXT",
      title: "The local fleet runner",
      paragraphs: [
        "The primary surface becomes a native desktop application. It owns Zellij, agent launching, session watching, and execution as the authoritative local runtime.",
        "The web portal becomes a first-class remote control surface — talking to your local apps over a clean, authenticated channel rather than indirect polling.",
        "One system. Two surfaces. The same reality.",
      ],
    },
    {
      marker: "LATER",
      title: "Robotic fleets",
      paragraphs: [
        "Direct fleets of physical robots with the same patterns: per-fleet autonomy, queue management, handoffs, and remote command.",
        "Robotics is a different execution surface bound to the same control plane.",
      ],
    },
  ],
  closer: "This roadmap is intentionally high-level. Detailed engineering plans live in internal documents and the architecture reference post.",
};

// Shared final CTA used at the bottom of every marketing page
export const FINAL_CTA = {
  title: "Begin.",
  note: "For builders running real agent operations.",
  cta: "Start building",
};

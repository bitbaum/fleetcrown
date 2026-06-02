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
      description: "FleetCrown is infrastructure for builders running many agents at once across multiple projects — not a friendly chat assistant.",
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
  contact: "investors@fleetcrown.app",
};

// Roadmap — multi-phase, with concrete bullets and cross-cutting throughlines
export const ROADMAP = {
  eyebrow: "PRODUCT DIRECTION",
  title: "Roadmap",
  lede: "Building the operating system for people running serious AI agent operations — and for the robotic fleets that come next.",
  phases: [
    {
      marker: "NOW",
      title: "Foundation",
      summary: "Live in production. The system already coordinates real fleets across real projects.",
      bullets: [
        "Web command center coordinates fleets of AI agents across projects.",
        "Per-project autonomy ladder: Manual → Queue → Beacon → Continuous → Mission.",
        "Two local execution paths: the production daemon and the newer event-sourced home/ stack (Brain + Bridge + Worker).",
        "Reliable handoff system between agent sessions, with truthful card status surfaces.",
        "Per-project pause / resume / direct-send semantics and a real autopilot intent ladder.",
        "Multi-user SaaS foundation — GitHub OAuth, organizations, team invites, agent tokens.",
      ],
      note: "The architecture is proven. The next phase is consolidating it into a real product.",
    },
    {
      marker: "NEXT",
      title: "The local fleet runner",
      summary: "The primary surface becomes a native desktop application — the authoritative local runtime instead of a background daemon.",
      bullets: [
        "Native Electron application packages the best of the home/ stack into a first-class product.",
        "Owns Zellij, agent launching, session watching, handoff files, and git directly — no polling layer in between.",
        "Desktop UI for full-power interaction when sitting at the machine.",
        "Clean local API and IPC so TUIs, scripts, and MCP clients can talk to it.",
        "Becomes the default install path: one command drops the desktop app on macOS, Windows, or Linux.",
        "The existing daemon path keeps working through the transition for users who do not want Electron.",
      ],
      note: "Cursor, Claude Code, and Grok Build all converged on this pattern independently — local client owns execution as a real application, not a service that polls a queue.",
    },
    {
      marker: "AFTER",
      title: "Remote control channel",
      summary: "Web and mobile become genuine remote control surfaces — not eventually-consistent dashboards.",
      bullets: [
        "The local app opens an authenticated outbound WebSocket to the control plane when remote control is enabled.",
        "Commands flow: surface → backend → that user's specific local app, over the open connection.",
        "Status flows back the same way, with low latency.",
        "Falls back to the existing queue when the local app is offline.",
        "Scoped credentials via the existing agent token system. Outbound-only connections — easy to firewall.",
        "All execution of dangerous actions stays on the user's machine. The backend never sees raw file contents unless the user explicitly shares them.",
      ],
    },
    {
      marker: "THEN",
      title: "Mobile fleet control",
      summary: "Steering a fleet from your phone should feel native, not like a phone-sized web page.",
      bullets: [
        "Native iOS and Android apps on the same remote control channel.",
        "Optimized for steering and approval, not authoring.",
        "Push notifications for Beacon mode and Mission checkpoints.",
        "Swipe actions for approving or rejecting agent outputs at the moments that actually need a human.",
        "Voice capture for the autopilot intent ladder — direct the fleet while walking.",
      ],
    },
    {
      marker: "LATER",
      title: "Cloud agents as a complementary mode",
      summary: "When the local machine is unavailable, parallel cloud agents take over — with explicit handoff.",
      bullets: [
        "Cloud agents for long-running, highly parallel work that does not fit on one laptop.",
        "Explicit handoff between local and cloud sessions — the same agent identity continues across substrates.",
        "A complement to local execution, never the default for hosted users.",
        "Useful for builders running 8–12 agents at once who need extra parallelism or 24-hour availability.",
      ],
    },
    {
      marker: "TEAMS",
      title: "Team and multi-machine surfaces",
      summary: "Same control plane, multiple operators, multiple machines.",
      bullets: [
        "Shared fleet views across machines and across team members.",
        "Per-operator permissions. Per-project autonomy ceilings.",
        "Coordination when several people steer the same fleet without stepping on each other.",
        "Multi-machine orchestration for power users running across desktop, laptop, and remote box.",
      ],
    },
    {
      marker: "CONVERGE",
      title: "One agent per user — the surface merge",
      summary: "Today's Ivy (FleetCrown) and Cat (OrangeCat) become one agent that sees the user's whole life. Two AIs is engineering convenience; one agent per user is the only interaction model that scales to nine billion builders.",
      bullets: [
        "Memory layer unifies — the user's contacts, projects, goals, transactions, listings, and decisions live in one graph the agent reasons against.",
        "Reasoning loop unifies — when the user says \"do X,\" the agent decomposes X across whatever surfaces are involved without the user choosing the surface.",
        "Autonomy ladder unifies — Manual → Queue → Beacon → Continuous → Mission applies across both products as one dial.",
        "Approval queue unifies — FleetCrown's Action Queue and OrangeCat's pending Cat actions become one inbox. The user lives in this queue.",
        "Surfaces (FleetCrown, OrangeCat) stay as engineering boundaries but stop being user-facing concepts. The user perceives \"my agent.\"",
      ],
      note: "See the Thoughts essay \"From Two AIs to One\" for the strategic argument. Convergence is engineering on top of two products that already work standalone, not a rewrite.",
    },
    {
      marker: "STAKEHOLDERS",
      title: "Stakeholder graph — the concrete first convergence",
      summary: "Every project has eight surrounding relationships — competitors, collaborators, investors, customers, employees, acquirers, acquisition targets, in-house dev projects. Track them as typed edges in OrangeCat's entity graph; surface them on FleetCrown; let the agent act on them.",
      bullets: [
        "Storage in OrangeCat. The eight categories are edges between entities OrangeCat already has (projects, actors, groups, products, services, investments). One typed-edge schema covers all eight — no new entity tables.",
        "Operations in FleetCrown. /projects renders the eight stakeholder lanes per project, read from OrangeCat via the identity bridge. The Watch on /today surfaces signals derived from the graph.",
        "Ship competitors first — the most automatable category. Landing-page diffs, RSS, funding-event detection, hiring-page diffs. The other seven follow with the same primitives.",
        "Action loop: signal → Watch focus → \"Brief Ivy on this\" → agent drafts a response (pricing tweak, positioning post, feature pull-forward) → approve / disapprove.",
        "No second graph. FleetCrown does not duplicate OrangeCat's entity model. Two graphs are always wrong.",
      ],
      note: "First concrete instance of the convergence — same data, two surfaces, one agent reasoning across both. See the Thoughts essay \"Where Stakeholders Live\" for the full design.",
    },
    {
      marker: "ECONOMY",
      title: "OrangeCat integration — the transaction half",
      summary: "Pair FleetCrown's production layer with OrangeCat's economic layer. The two halves of the individual singularity, settled to the same operator on the same terms.",
      bullets: [
        "Identity bridge — FleetCrown users connect their OrangeCat actor through OAuth. One identity, two products, one settlement layer.",
        "Publish to OrangeCat — a project or agent output becomes a product or service listing with Lightning payments in one click.",
        "Agent costs as outflows — compute, API tokens, and third-party services route through the operator's OrangeCat Cat. The economy of the fleet becomes legible and auditable per project.",
        "Subscriptions as assets — FleetCrown's Money tab knows what the operator pays for; OrangeCat coordinates funding, lending, and shared-asset ownership so dragging subscriptions can be refinanced or sublet without leaving the platform.",
        "FleetCrown pricing on Lightning rails — FleetCrown's own revenue settles through OrangeCat. No Stripe in the path. Pseudonymous customers welcome.",
      ],
      note: "The pieces exist in production today on both platforms (fleetcrown.vercel.app and orangecat.ch). FleetCrown is a customer of OrangeCat (via typed stakeholder 'customer' edge in the shared graph). See the live projects 'OrangeCat' and 'FleetCrown' on orangecat.ch under Mao Nakamoto. The integration is engineering, not invention. See the Thoughts essay \"The Two Halves of the Individual Singularity\" for the full strategic argument. Built for real customers like FleetWave.",
    },
    {
      marker: "ROBOTICS",
      title: "Physical robotic fleets",
      summary: "The same control patterns, applied to a different substrate.",
      bullets: [
        "Per-fleet autonomy — the same dial: Manual → Queue → Beacon → Continuous → Mission.",
        "Handoff between human and robotic initiative.",
        "Queues, visibility, override — everything we shipped for software agents transfers.",
        "Robotics is a different execution surface bound to the same control plane.",
        "Not a separate product line bolted on later. The continuity is the point.",
      ],
      note: "The person who today directs a fleet of agents building software is developing the muscles that will let them direct a fleet of robots building physical things.",
    },
  ],
  throughlines: {
    eyebrow: "WHAT STAYS CONSTANT",
    title: "Throughlines",
    lede: "These do not change as the phases ship. They are constraints we hold across every stage.",
    items: [
      {
        title: "Local execution is privileged.",
        body: "When the user's machine can do the work, it should. We do not push everyone into remote sandboxes.",
      },
      {
        title: "Open and local models are first-class.",
        body: "Frontier subscriptions are often the best tool. But the infrastructure does not require them — the user points their fleet at whatever model serves their goals best.",
      },
      {
        title: "Autonomy is a user-controlled dial.",
        body: "Manual, Queue, Beacon, Continuous, Mission. Per project. Per moment. Never forced.",
      },
      {
        title: "Outbound connections only.",
        body: "The local client connects out to the control plane, not the other way around. Easier to firewall. Easier to reason about. Credible to security-conscious operators.",
      },
      {
        title: "Nothing hidden.",
        body: "Every agent's state is legible. No black boxes inside your own fleet.",
      },
    ],
  },
  closer: "This is the public-facing roadmap. Detailed engineering plans, deadlines, and sequencing live in internal documents and the architecture reference post.",
};

// Shared final CTA used at the bottom of every marketing page
export const FINAL_CTA = {
  title: "Begin.",
  note: "For builders running real agent operations.",
  cta: "Start building",
};

// Download / install section for the desktop Fleet Runner (the local authoritative app).
// SSOT for the public download experience. Update links + copy here when we ship real artifacts.
export const DESKTOP_DOWNLOAD = {
  eyebrow: "LOCAL FLEET RUNNER",
  title: "Install the desktop app",
  lede:
    "The Fleet Runner is the native application that runs on your machines. It owns Zellij, agent launching, session watching, handoffs, and git — no daemon polling layer between you and the work. Web and mobile are remote control surfaces for the same system.",
  note:
    "Today: build from source for Linux (AppImage + .deb). The same process works for macOS and Windows. Packaged, signed, auto-updating releases for all major desktop platforms are coming soon. The legacy terminal daemon remains available during transition.",
  ctaLabel: "Download for your platform",
  platforms: [
    {
      id: "mac",
      label: "macOS",
      note: "Build from source today (Universal) · Signed one-click coming soon",
      url: "https://github.com/g-but/cockpit/releases",
    },
    {
      id: "win",
      label: "Windows",
      note: "Build from source today (x64) · Signed installer coming soon",
      url: "https://github.com/g-but/cockpit/releases",
    },
    {
      id: "linux",
      label: "Linux",
      note: "AppImage • .deb (build now) · Signed packages + repos coming soon",
      url: "https://github.com/g-but/cockpit/releases",
    },
  ],
  fallback: {
    label: "Install the legacy daemon (terminal)",
    description:
      "For headless servers, CI, or users who prefer the old flow. The desktop Fleet Runner will become the recommended path.",
    command: "curl -fsSL https://fleetcrown.vercel.app/api/agent/install | node - init",
  },
  buildFromSource: {
    label: "Build the Fleet Runner (current way to get it)",
    description: "Clone and build to get a native AppImage / .deb (or equivalent on your OS) you can run immediately. This is the local authoritative runtime.",
    steps: "git clone https://github.com/g-but/cockpit.git && cd cockpit/desktop && npm install && npm run dist:linux  # (use dist:mac or dist:win on other machines)",
  },
  future: {
    desktop: "One-click downloadable installers with auto-update for macOS, Windows, and Linux (App Store, winget, apt, etc. where appropriate).",
    mobile: "Native iOS and Android apps on the same remote control channel — full fleet visibility, queue management, and dispatch from your phone or tablet.",
    other: "Additional runtimes and form factors (headless variants, CLI polish, and support for the platforms builders actually use).",
  },
};

// FleetWave real customer + OrangeCat integration (SSOT for cross-product customer story)
// FleetCrown (production/AI fleet) is a paying customer of OrangeCat (economic layer).
// Both + FleetWave are live projects/profiles on orangecat.ch under Mao Nakamoto.
// Shared BTC wallet, typed "customer" + "in_house_dev" stakeholder edges via stakeholder_relationships.
// This demonstrates the full stack for a real customer; scales to others.
export const FLEETWAVE_ORANGECAT_INTEGRATION = {
  customer: "FleetWave",
  owner: "Mao Nakamoto",
  orangeCat: {
    title: "OrangeCat",
    projectUrl: "https://www.orangecat.ch/projects/cb093f00-8745-4579-98df-050ebfb37181",
    profile: "https://www.orangecat.ch/profile/mao-nakamoto",
  },
  fleetCrown: {
    title: "FleetCrown",
    projectUrl: "https://www.orangecat.ch/projects/8130c927-114a-45b7-8cc2-99efd5224025",
    site: "https://fleetcrown.vercel.app",
  },
  fleetWave: {
    title: "FleetWave",
    projectUrl: "https://www.orangecat.ch/projects/8502031c-1e71-4fea-a011-ffae17c74e25",
  },
  wallet: {
    btc: "bc1q3hh4yklcmwtpnqmxyksw36yedg7zyfy6tzzqwz",
    lightning: "orangecat@getalby.com",
  },
  relation: "FleetCrown is 'customer' of OrangeCat; FleetWave is the real operating customer using the combined stack.",
  note: "See stakeholder_relationships table (migration applied 2026-06) and live data. One is customer of the other.",
};

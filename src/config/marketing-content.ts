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
  built: "A web command center coordinates fleets of AI agents across projects. A native Fleet Runner desktop app — same React tree as the web, plus tray and OS notifications — runs them directly in the operator's terminal environment via Zellij. Per-project autonomy controls, reliable handoff systems, queue management, and truthful status surfaces are live and in daily use. Signed multi-OS installers ship from a single CI matrix on every release tag.",
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
        "Native Fleet Runner desktop app — loads the same React tree the web serves (one UI, two surfaces) plus tray icon, OS notifications on agent idle, and an embedded Zellij watcher for fire-and-walk-away dispatch.",
        "Multi-OS release pipeline. One tag push produces signed macOS, Windows, and Linux installers from a shared CI matrix.",
      ],
      note: "The architecture is proven. The next phase is finishing distribution and auto-update so non-technical operators can install without touching a terminal.",
    },
    {
      marker: "NEXT",
      title: "Distribution and auto-update",
      summary: "Make Fleet Runner trivial to install and keep current on every platform — including for builders who never open a terminal.",
      bullets: [
        "Public macOS (.dmg, signed + notarized) and Windows (.exe) builds landing on every tagged release alongside the existing Linux AppImage / .deb.",
        "Auto-update via electron-builder's GitHub provider so users never download a stale binary.",
        "Native package channels where they exist — Homebrew tap for macOS, winget for Windows, .deb apt repo for Linux.",
        "Clean window.fleetRunner IPC bridge so the web React tree can detect 'I am running inside the desktop app' and surface desktop-only affordances coherently.",
        "Daemon install path stays supported for headless servers, CI runners, and operators who prefer a pure CLI flow.",
      ],
      note: "Cursor, Claude Code, and Grok Build all converged on the same pattern — local client owns execution as a real application, not a service that polls a queue. Fleet Runner takes one extra step: the app and the web run the same React tree, so there is exactly one product surface to design and one codebase to keep at parity.",
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
      note: "The pieces exist in production today on both platforms (fleetcrown.vercel.app and orangecat.ch). FleetCrown is a customer of OrangeCat (via typed stakeholder 'customer' edge in the shared graph). See the live projects 'OrangeCat' and 'FleetCrown' on orangecat.ch under Mao Nakamoto. The integration is engineering, not invention. See the Thoughts essay \"The Two Halves of the Individual Singularity\" for the full strategic argument.",
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

// Download / install section for the desktop Fleet Runner (the optional local app).
//
// SSOT for the public download experience. The shape is deliberately narrative,
// not a flat file list: a non-technical visitor reads it top to bottom and gets
// answers in order — what is this, do I need it, how to get it, what happens
// next. Update links + copy here when we ship real artifacts.
//
// Platform status is honest: only "ready" platforms show a real installer URL.
// "comingSoon" platforms surface a release-watch CTA (GitHub releases atom
// subscription) and a *clearly demoted* build-from-source path for developers,
// instead of pretending the source tree is a download.
export const DESKTOP_DOWNLOAD = {
  // Top-level back-compat fields (used by /download page metadata + homepage).
  eyebrow: "DESKTOP APP",
  title: "Get Fleet Runner",
  lede:
    "FleetCrown runs in your browser as a full control plane. Fleet Runner is the optional desktop app that lets agents act on your computer — open files, run commands, drive terminal sessions — while you stay in command from the web or your phone.",

  hero: {
    eyebrow: "DESKTOP APP",
    title: "Get Fleet Runner",
    lede:
      "FleetCrown runs in your browser as a full control plane. Fleet Runner is the optional desktop app that lets agents act on your computer — open files, run commands, drive terminal sessions — while you stay in command from the web or your phone.",
  },

  // Web vs. desktop — answers "do I need this?" in plain language.
  comparison: {
    web: {
      label: "Web (fleetcrown.com)",
      tagline: "Already available — no install",
      bullets: [
        "Full fleet visibility across all projects",
        "Browse history, projects, and queues",
        "Dispatch commands from any browser or phone",
        "Read-only without a connected local runner",
      ],
    },
    desktop: {
      label: "Desktop (Fleet Runner)",
      tagline: "Adds local execution",
      bullets: [
        "Actually runs agents on your machine",
        "Drives Zellij sessions and handoffs",
        "Native notifications when an agent finishes",
        "Keeps working after you close your browser",
      ],
    },
    note: "You can start with the web today and add Fleet Runner whenever you want agents to actually do work on your machine.",
  },

  // Three steps that answer "what happens after I click download?"
  // Numbered so visual layout can render as a step indicator on dark bg.
  setupSteps: [
    {
      number: "01",
      title: "Make it runnable, then open",
      body:
        "On Linux, downloads start non-executable for safety. Paste the one-line command shown under Download to mark Fleet Runner executable and launch it. On macOS and Windows (coming soon), a normal double-click is enough.",
    },
    {
      number: "02",
      title: "Sign in — once",
      body:
        "Use the same FleetCrown account you signed up with on the web. The desktop app opens straight to your dashboard. From the web, you can also click \"Open in Fleet Runner\" to log the desktop app in without copy-pasting a token. From v0.3.0 onward, Fleet Runner checks for updates on launch and downloads them in the background — you'll never have to manually re-download.",
    },
    {
      number: "03",
      title: "Dispatch your first intent",
      body:
        "Pick a project on your computer and dispatch an intent. Fleet Runner launches the agent in a terminal session and pings you when it hands off — even if the app is hidden. The terminal session manager ships inside Fleet Runner; you just need at least one agent CLI installed (Claude Code or Grok — see prerequisites below).",
    },
  ],

  // Platforms with honest "ready" vs "comingSoon" status. The component shows
  // a real CTA + secondary formats for ready platforms, and a release-watch
  // link + collapsed build-from-source for coming-soon platforms.
  platforms: [
    {
      id: "linux",
      label: "Linux",
      status: "ready" as const,
      primary: {
        label: "Download AppImage",
        note: "Recommended · ~108 MB",
        // /releases/latest/download/... — GitHub redirects to the current
        // release, so this URL survives future version bumps without a
        // marketing-content edit per release.
        url:
          "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-linux-x86_64.AppImage",
      },
      secondary: [
        {
          label: ".deb (Ubuntu / Debian)",
          url:
            "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-linux-amd64.deb",
        },
      ],
      afterDownload:
        "Linux marks downloads non-executable by default. Open a terminal and paste this one line — it makes the file runnable and launches it. If KDE / Dolphin blocked it \"for security reasons,\" this is the fix:",
      command:
        "chmod +x ~/Downloads/Fleet-Runner-linux-*.AppImage && ~/Downloads/Fleet-Runner-linux-*.AppImage",
    },
    {
      id: "mac",
      label: "macOS",
      status: "ready" as const,
      primary: {
        label: "Download .dmg",
        note: "Apple Silicon · ~98 MB",
        url:
          "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-mac-arm64.dmg",
      },
      secondary: [
        {
          label: ".zip (no installer)",
          url:
            "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-mac-arm64.zip",
        },
      ],
      afterDownload:
        "Open the .dmg, drag Fleet Runner to Applications, then launch it. First time only: macOS will warn \"Apple cannot check this for malicious software\" (we're not yet code-signed). Control-click the app → Open → Open. After that one bypass, it launches normally:",
      command: "open ~/Applications/Fleet\\ Runner.app",
    },
    {
      id: "win",
      label: "Windows",
      status: "ready" as const,
      primary: {
        label: "Download installer",
        note: "x64 · ~81 MB",
        url:
          "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-win-x64.exe",
      },
      secondary: [],
      afterDownload:
        "Run the .exe. Windows SmartScreen may say \"unrecognized app\" (we're not yet code-signed). Click \"More info\" → \"Run anyway.\" The installer takes care of the rest:",
      command: "Fleet-Runner-win-x64.exe",
    },
  ],

  // "What Fleet Runner uses on your computer" — plain-language explanation of
  // why each tool exists, not a wall of curl commands.
  prerequisites: {
    title: "What Fleet Runner uses on your computer",
    description:
      "Fleet Runner doesn't replace the tools you already use — it drives them. Only one thing must exist on your machine for an agent to actually run: a supported agent CLI. Pick whichever AI you prefer; you only need one to start. (Zellij — the terminal session manager that gives each agent its own pane — ships inside Fleet Runner since v0.2.0, so you no longer install it separately.)",
    items: [
      {
        title: "Claude Code",
        role: "Anthropic's coding agent",
        required: true,
        whyYouNeedIt:
          "One supported agent CLI is required — Claude Code is the recommended default. Skip this if you already plan to install Grok below; you only need one.",
        href: "https://code.claude.com/docs/en/installation",
        installLabel: "Install Claude Code",
        command: "npm install -g @anthropic-ai/claude-code",
      },
      {
        title: "Grok Build",
        role: "xAI's coding agent",
        required: false,
        whyYouNeedIt:
          "Alternative agent CLI. Install instead of Claude Code, or alongside it if you want both available to the fleet.",
        href: "https://x.ai/cli",
        installLabel: "Install Grok CLI",
        command: "curl -fsSL https://x.ai/cli/install.sh | bash",
      },
      {
        title: "Zellij",
        role: "Bundled — no install needed",
        required: false,
        whyYouNeedIt:
          "Fleet Runner v0.2.0+ ships with a known-good Zellij inside the bundle and prefers it over any system install. Listed here only so you know what's running. Install it yourself only if you also want a system-wide Zellij outside Fleet Runner.",
        href: "https://zellij.dev/documentation/installation.html",
        installLabel: "Zellij docs (optional)",
      },
    ],
  },

  // Developer / advanced — collapsed by default in the UI.
  developer: {
    label: "For developers",
    description:
      "Build the desktop app yourself, or run the headless terminal daemon instead.",
    buildFromSource: {
      label: "Build the desktop app from source",
      body:
        "Clone and build a native package for your machine. Useful if you're contributing, want a development build, or are on a platform we don't ship binaries for yet.",
      command:
        "git clone https://github.com/maonakamoto/fleetcrown.git && cd fleetcrown/desktop && npm install && npm run dist:linux  # or dist:mac / dist:win",
    },
    legacyDaemon: {
      label: "Headless terminal daemon",
      body:
        "For CI runners, headless servers, or operators who prefer a pure CLI flow. Fleet Runner is the recommended path; the daemon remains available during the transition.",
      command:
        "curl -fsSL https://fleetcrown.vercel.app/api/agent/install | node - init",
    },
  },

  // "Coming to more surfaces" — kept in case the homepage section wants it.
  future: {
    desktop:
      "One-click signed installers with auto-update for macOS, Windows, and Linux.",
    mobile:
      "Native iOS and Android apps on the same remote control channel — fleet visibility, queues, and dispatch from your phone.",
  },
};
export type DesktopDownloadPlatform = (typeof DESKTOP_DOWNLOAD.platforms)[number];

export const PRODUCT_SURFACES = [
  {
    label: "Control",
    title: "See the whole fleet at once.",
    body: "Every project, active agent, queue item, and handoff sits in one operating view instead of disappearing into terminal tabs.",
    meta: "Live sessions · autonomy levels · dispatch",
  },
  {
    label: "Runner",
    title: "Execution stays on your machine.",
    body: "The local runner owns Zellij, git, agent launching, and handoff files. FleetCrown coordinates the work without turning your environment into a cloud sandbox.",
    meta: "Desktop app · daemon fallback · agent tokens",
  },
  {
    label: "Beacon",
    title: "Human judgment appears at the right moments.",
    body: "Queue, Beacon, Continuous, and Mission modes let each project ask for oversight only when the next decision actually needs you.",
    meta: "Approvals · voice intent · remote command",
  },
] as const;

export const START_PATHS = [
  {
    title: "Run locally",
    body: "Install or build the Fleet Runner, connect an agent token, and let your real machine become the authoritative execution surface.",
    href: "/download",
    cta: "Download runner",
  },
  {
    title: "Open the control plane",
    body: "Create an account, add projects, and command agent sessions from the hosted web surface.",
    href: "/sign-up",
    cta: "Start building",
  },
  {
    title: "Read the architecture",
    body: "Understand the local-runner, remote-control, queue, and handoff design before committing your workflow to it.",
    href: "/whitepaper",
    cta: "View whitepaper",
  },
] as const;

// OrangeCat integration for FleetCrown (SSOT for cross-product customer story)
// FleetCrown (production/AI fleet) is a paying customer of OrangeCat (economic layer).
// Both OrangeCat and FleetCrown are live projects/profiles on orangecat.ch under Mao Nakamoto.
// Shared BTC wallet, typed "customer" stakeholder edge via stakeholder_relationships.
// This demonstrates the full stack; scales to other customers.
export const ORANGECAT_INTEGRATION = {
  customer: "FleetCrown",
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
  wallet: {
    btc: "bc1q3hh4yklcmwtpnqmxyksw36yedg7zyfy6tzzqwz",
    lightning: "orangecat@getalby.com",
  },
  relation: "FleetCrown is 'customer' of OrangeCat via the shared stakeholder graph.",
  note: "See stakeholder_relationships table (migration applied) and live data on orangecat.ch. One is customer of the other.",
};

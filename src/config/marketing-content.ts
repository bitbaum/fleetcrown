import { APP_NAME, APP_DOMAIN, MARKETING_TAGLINE, MARKETING_SUBTITLE, MARKETING_POSITIONING } from "./brand";

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

// Hero product visual — static chrome only. The actual fleet snapshot (projects,
// status, metrics) is fetched LIVE from the owner's real fleet in page.tsx via
// getHeroFleetSnapshot(); we never ship fabricated fleet data. This holds only
// the constant label text used by the console header.
export const HOME_HERO_CONSOLE = {
  label: "Fleet Command",
} as const;

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
  // Scannable bullets, not a prose wall — the page pairs these with the live
  // fleet snapshot (same real data source as the homepage hero).
  traction: [
    "FleetCrown runs its creator's entire operation — a live fleet of projects dispatched, monitored, and governed daily through the product itself.",
    "Every surface is proven in continuous real-world self-use before it ships; the operator is the first and most demanding user.",
    "The homepage hero and this page render the same live snapshot of that fleet — real data, never fabricated numbers.",
    "The bet: the same workflow generalizes to anyone running many agents at once.",
  ],
  ask: "We are raising to productize the local fleet runner, harden the remote control plane, expand open-model support, and lay groundwork for robotic orchestration.",
};

export const INVESTOR_DETAILS = {
  deck: "Available upon request",
  contact: "mao@orangecat.ch",
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
        "One-button fleet autopilot: pause all, or build all — agents drain each project's queue, then pick the next-best task.",
        "One local execution path: the Fleet Runner desktop app owns Zellij, agent launching, and state sync (the legacy bash runner was retired by deletion).",
        "Reliable handoff system between agent sessions, with truthful card status surfaces.",
        "Per-project pause / resume / direct-send semantics with per-project autopilot overrides.",
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
        "Headless CLI agent install path for servers, CI runners, and operators who prefer a pure terminal flow.",
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
      marker: "LEARNING",
      title: "The fleet learns from its own runs",
      summary: "Today FleetCrown grades every run and forgets what it learned. The same evidence that decides whether a run was done should decide how the next one is briefed.",
      bullets: [
        "Every dispatch is stored with the exact prompt that produced it and the graded outcome it earned — one joinable record instead of two disconnected logs.",
        "A per-intent report shows which kinds of work fail, how much they cost, and the most common reason a reviewer rejected them.",
        "Prompt improvements are proposed from real run history and reviewed by a human before they land — the same accept-or-dismiss gate the Frontier loop already uses.",
        "Per-project lessons carry forward as references the agent may consult, never as rules it must obey.",
        "Every learned change stays in version control, so any improvement can be read, questioned, and reverted.",
      ],
      note: "The judge that grades a run is a different model lineage from the agent that did the work, and no learned change applies itself. A harness that grades its own trajectory and edits itself unsupervised is how self-improving systems learn to game their own scoring — the human gate is the feature, not the friction. Detailed sequencing lives in the internal self-improvement plan.",
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
      summary: "Today's Loki (FleetCrown) and Cat (OrangeCat) become one agent that sees the user's whole life. Two AIs is engineering convenience; one agent per user is the only interaction model that scales to nine billion builders.",
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
        "Action loop: signal → Watch focus → \"Brief Loki on this\" → agent drafts a response (pricing tweak, positioning post, feature pull-forward) → approve / disapprove.",
        "No second graph. FleetCrown does not duplicate OrangeCat's entity model. Two graphs are always wrong.",
      ],
      note: "First concrete instance of the convergence — same data, two surfaces, one agent reasoning across both. See the Thoughts essay \"Where Stakeholders Live\" for the full design.",
    },
    {
      marker: "ECONOMY",
      title: "OrangeCat integration — the transaction half",
      summary: "Make it natural to fund what people build and build what people choose to fund, without pretending the full loop is already automated.",
      bullets: [
        "One OrangeCat identity across both products through the existing OIDC bridge.",
        "Typed links connect a FleetCrown project to any OrangeCat entity acting as its origin, public profile, funding page, offering, or community.",
        "A signed, ten-minute OrangeCat handoff can prefill a FleetCrown project and Loki plan; the owner approves before anything is created or dispatched.",
        "OrangeCat remains the share, promotion, and Bitcoin funding surface. FleetCrown shows its confirmed funding summary read-only.",
        "Automatic work orders, milestone-triggered dispatch, smart-contract escrow, fiat, privacy coins, and full Nostr identity stay later-roadmap work.",
      ],
      note: "Bitcoin is the first live settlement rail because confirmed transfers can be independently audited. Fiat relies on private bank reconciliation; privacy coins deliberately remove the public trail. Neither is presented as available today.",
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
        title: "Autonomy is a user-controlled switch.",
        body: "Pause all, or build all — with per-project overrides. Per project. Per moment. Never forced.",
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
      label: `Web (${APP_DOMAIN})`,
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
        // .deb is the recommended default — system package manager handles
        // perms + integration. AppImage hits KDE/KIO "for security reasons"
        // refusal on double-click (Dolphin blocks the +x bit by policy) and
        // requires terminal chmod, which is a dead-end for non-power-users.
        // Most FleetCrown users are on Ubuntu/Debian derivatives where .deb
        // Just Works. AppImage stays as a secondary for Arch / Fedora /
        // immutable distros where .deb isn't the right format.
        label: "Download .deb (Ubuntu / Debian / Mint)",
        note: "Recommended · ~80 MB · installs via package manager",
        // /releases/latest/download/... — GitHub redirects to the current
        // release, so this URL survives future version bumps.
        url:
          "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-linux-amd64.deb",
      },
      secondary: [
        {
          label: "AppImage (other distros)",
          url:
            "https://github.com/maonakamoto/fleetcrown-releases/releases/latest/download/Fleet-Runner-linux-x86_64.AppImage",
        },
      ],
      afterDownload:
        "Open a terminal and paste this one line. It installs Fleet Runner system-wide, then launches it. No file-manager dance, no KDE security popup:",
      command:
        "sudo dpkg -i ~/Downloads/Fleet-Runner-linux-amd64.deb && fleet-runner",
    },
    {
      id: "mac",
      label: "macOS",
      // Linux-only ships today (the latest release has no mac asset); surface the
      // honest release-watch CTA instead of a Download button that 404s.
      status: "comingSoon" as const,
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
      // No Windows asset on the latest release yet — show the release-watch CTA
      // rather than a Download button that 404s.
      status: "comingSoon" as const,
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
      "Build the desktop app yourself, or run the headless CLI agent instead.",
    buildFromSource: {
      label: "Build the desktop app from source",
      body:
        "Clone and build a native package for your machine. Useful if you're contributing, want a development build, or are on a platform we don't ship binaries for yet.",
      command:
        "git clone https://github.com/maonakamoto/fleetcrown.git && cd fleetcrown/desktop && npm install && npm run dist:linux  # or dist:mac / dist:win",
    },
    legacyDaemon: {
      label: "Headless CLI agent",
      body:
        "For CI runners, headless servers, or operators who prefer a pure terminal flow. Fleet Runner is the recommended path; the CLI agent covers machines that can't run a desktop app.",
      command:
        "curl -fsSL https://fleetcrown.orangecat.ch/api/agent/install | node - init",
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
    label: "Loki",
    title: "Say what you want. It runs.",
    body: "One conversational composer turns plain language into action — “code review for kivvi” dispatches it into that project; a question gets answered. The system picks the project and the path, so you hold less in your head.",
    meta: "Natural language · auto-routing · voice",
  },
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
    meta: "Desktop app · CLI agent fallback · agent tokens",
  },
  {
    label: "Beacon",
    title: "Human judgment appears at the right moments.",
    body: "Fleet-wide play/pause with per-project queues and overrides — each project asks for oversight only when the next decision actually needs you.",
    meta: "Approvals · voice intent · remote command",
  },
  {
    label: "Terminal",
    title: "Watch and drive any agent live.",
    body: "An embedded terminal per project — see exactly what the cloud builder or your local runner is typing, and type into it yourself when the moment calls for hands on the wheel.",
    meta: "Live PTY · cloud + local · per-project tabs",
  },
  {
    label: "Feedback",
    title: "Your visitors file the work.",
    body: "One script tag puts a feedback button on any site you run. Reports land in a per-project inbox, one click dispatches an agent to fix them, and when the fix ships the reporter gets an email.",
    meta: "Embeddable widget · agent dispatch · closed loop",
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

// Kept as a re-export for existing imports. New public integration surfaces
// should import from config/ecosystem directly.
export { ORANGECAT_INTEGRATION } from "./ecosystem";

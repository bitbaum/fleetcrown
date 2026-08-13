import { APP_NAME } from "@/config/brand";

/**
 * SSOT for user-facing execution copy.
 *
 * Users see one concept: the **builder** (cloud + optional this computer).
 * Internal code, Settings, and /download may still say "Fleet Runner".
 */
export const EXECUTOR_COPY = {
  /** Unified executor — cloud (box-runner) and/or this computer (desktop app) */
  builder: {
    online: "Builder online",
  cloudOnline: "Cloud builder online",
  localComputerOnline: "This computer online",
  bothOnline: "Cloud + this computer online",
  cloudOnlyDetail: "This computer offline — cloud builder runs the queue",
  localOnlyDetail: "Cloud builder offline — this computer runs the queue",
  cloudOffline: "Cloud builder offline",
  localComputerOffline: "This computer offline",
    offline: "Builder offline",
    queued: "Queued",
    building: "Building",
    setupOptional: "Browser only",
    uncertain: "Status uncertain",
    staleSync: "Cached value — builder hasn't pushed fresh state",
    versionPrefix: "builder",
  },

  /** This computer = laptop/desktop Fleet Runner (optional local path) */
  thisComputer: "This computer",

  /** Cloud = hosted builder channel (private beta until per-tenant sandboxes ship) */
  cloud: "Cloud",

  desktopApp: `${APP_NAME} desktop`,

  queuedWhenOffline: "Queued — runs when the builder is online",

  queuedWhenOfflineLong:
    "Work stays in the queue and starts when a builder is online (cloud or this computer).",

  /** Cloud web app always queues; this means a live builder will drain it. */
  queuedWithBuilderOnline: "With builder — starting shortly",
  queuedWithBuilderOnlineLong:
    "a builder is online and will claim it shortly. Use Control for state, or open Cloud terminal / This computer to watch and type in the agent session.",

  onboarding: {
    stepTitle: "You're ready to build",
    stepDescriptionTeam:
      "Use the web app from anywhere. Connect this computer when you want agents to run your repos and tools.",
    stepDescription:
      "Same app in your browser or on desktop — one account, one Control page.",
    intro: `${APP_NAME} runs in your browser. Connect a builder when you want agents to work. Hosted cloud builders are private beta; Fleet Runner on this computer is the default path for new accounts.`,
    browserPath: {
      title: "Continue in your browser",
      body: "Create projects, keep strategy and context, and connect a builder before dispatching agent work.",
    },
    desktopPath: {
      title: "Run agents on this computer",
      body: `This is how agent work actually runs: install ${APP_NAME} desktop to dispatch agents against local folders and your own CLI logins. It uses your account token, so your queue stays tenant-scoped.`,
      cta: "Get the desktop app",
      href: "/download",
    },
    finishLabel: "Go to Control →",
    connectedBanner: "This computer is connected to the builder",
  },

  runnerBanner: {
    offlineChip: (lastSeen: string | null) =>
      lastSeen
        ? `Builder offline · last seen ${lastSeen} — work stays queued`
        : "Builder offline — work stays queued",
    reconnect: "How to reconnect",
    neverSeenTitle: "Connect a builder to run agents",
    offlineTitle: "Builder offline",
    neverSeenBody:
      "Connect Fleet Runner on this computer to execute agent work for this account. Hosted cloud builders are private beta.",
    offlineBody:
      "No builder is executing right now. Work stays queued — nothing is lost. Open the desktop app on this computer, or ensure the cloud builder is running.",
    reconnectHint: "Using this computer? Open the desktop app from the menu bar. Still stuck?",
    settingsLink: "Settings → Agent tokens",
    downloadLink: "re-install the desktop app",
  },

  fleetKick: {
    started: (n: number) =>
      `Started **${n}** project loop${n === 1 ? "" : "s"}. Autopilot keeps going when agents finish.`,
    startedQueued: (n: number) =>
      `Queued **${n}** project${n === 1 ? "" : "s"} to build — starts when the builder is online.`,
    slotsBusy: (max: number) =>
      `All **${max}** build slots are busy — loops continue automatically when agents finish.`,
    nothingToKick:
      "No idle projects to kick right now — agents may already be working, queued, or paused per project.",
    watchControl: "Watch progress on [Control](/control).",
  },

  inject: {
    queuedOfflineApi: "Queued — builder offline (runs when online)",
    hostedFallback:
      "Builder offline — cloud worker will make the change and open a PR.",
    hostedAndLocal:
      "Builder offline — cloud worker started; this computer runs it too when connected.",
    queuedOnly:
      "Queued — runs when the builder is online.",
  },

  /** How Loki (and Control) reach the agent CLI — not a separate chat channel. */
  loki: {
    buildChain:
      "Loki dispatches into the same builder queue as Control. A cloud or desktop builder claims the job, types into the agent terminal (Claude, Codex, …), and you work alongside it on Terminal → Cloud or This computer.",
    watchCloud: "Cloud terminal",
    watchThisComputer: "This computer",
  },

  /** Short labels on dispatch / terminal actions — honest before click. */
  honesty: {
    queued: "Queued",
    needsBuilder: "Needs builder",
    needsGitHub: "Needs GitHub",
    needsGateway: "Needs Loki gateway",
    // Standing presence chip — it shows while idle, while running, while
    // watching. "Starting shortly" was a lie in two of those three states;
    // the chip only truthfully knows the builder is connected. Post-dispatch
    // confirmations keep their own "starting shortly" copy where it IS true.
    builderStarting: "Builder online",
  },

  terminal: {
    // Names the two switches the mode bar exposes, because they are the whole
    // point of the page: one shell, and you choose where it runs and how you
    // talk to it. The old subtitle described only typing, which was the single
    // thing the terminal could already do.
    pageSubtitle:
      "The live agent session. Type into it the same way you would locally.",
    cloudLabel: "Cloud",
    cloudLabelLocalHost: "Cloud (this server)",
    thisComputerLabel: "This computer",
    cloudHelp:
      "Agents on the cloud builder (box-runner). Pick a project tab, click to focus, and type — keystrokes go straight to the agent PTY. Ctrl+C, arrows, and paste work.",
    cloudLoading: "Looking for agents on the cloud builder…",
    cloudEmpty: "Nothing running on the cloud builder.",
    cloudEmptyHint: "Start work in Loki. When an agent is running, it appears here so you can type into it.",
    cloudOfflineHint: "The cloud builder (box-runner on Hetzner) is offline right now.",
    // Connected to the peek stream but no screen frames arrived → the runner is
    // wedged (e.g. its outbound fetch is failing). Honest, actionable — not a
    // black pane labelled "live".
    cloudStalledHint: "Connected, but the cloud builder isn't streaming this session — it may be stuck. Check the box-runner service on Hetzner.",
    thisComputerStalledHint: "Connected, but Fleet Runner on this computer isn't streaming output — it may be stuck. Quit it from the menu bar and reopen.",
    thisComputerHelp:
      "Interactive view of agents on this computer via the desktop app. Same keystroke path as Cloud — click the terminal and type.",
    thisComputerEmpty: "Nothing running on this computer.",
    thisComputerEmptyHint: "Start work in Loki. The live session shows up here.",
    thisComputerOfflineHint: "Connect Fleet Runner on this computer to this account.",
    thisComputerLoading: "Looking for agents on this computer…",
  },
} as const;

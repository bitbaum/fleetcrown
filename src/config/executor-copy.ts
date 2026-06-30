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
    offline: "Builder offline",
    queued: "Queued",
    building: "Building",
    setupOptional: "Browser only",
    uncertain: "Status uncertain",
    stalledTitle: "Builder stalled",
    stalledShort: (n: number) =>
      `Builder stalled — ${n} job${n === 1 ? "" : "s"} queued (restart the desktop app or check cloud logs)`,
    stalledDetail: (n: number, seconds: number) =>
      `Builder is connected but not executing (${n} queued ${seconds}s). Restart the desktop app or check the cloud builder service.`,
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
      title: "Optional — also run on this computer",
      body: `Install ${APP_NAME} desktop to dispatch agents against local folders and your own CLI logins. It uses your account token, so your queue stays tenant-scoped.`,
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
    neverSeenTitle: "Optional — use this computer too",
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

  terminal: {
    pageSubtitle:
      "Full interactive terminals — type directly into cloud or desktop agent sessions, like Cursor.",
    cloudLabel: "Cloud",
    cloudLabelLocalHost: "Cloud (this server)",
    thisComputerLabel: "This computer",
    cloudHelp:
      "Agents on the cloud builder (box-runner). Pick a project tab, click to focus, and type — keystrokes go straight to the agent PTY. Ctrl+C, arrows, and paste work.",
    cloudLoading: "Looking for agents on the cloud builder…",
    cloudEmpty: "No agents on the cloud builder right now.",
    cloudEmptyHint: "Cloud builder is available only for enabled accounts until hosted sandboxes are tenant-isolated.",
    thisComputerHelp:
      "Interactive view of agents on this computer via the desktop app. Same keystroke path as Cloud — click the terminal and type.",
    thisComputerEmpty: "No agents on this computer right now.",
    thisComputerEmptyHint: "Launch from Control or Loki after Fleet Runner is connected to this account.",
    thisComputerLoading: "Looking for agents on this computer…",
  },
} as const;

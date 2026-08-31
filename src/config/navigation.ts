import {
  Sun,
  Users,
  Wallet,
  Target,
  FolderKanban,
  Server,
  Zap,
  Calendar,
  Repeat2,
  Bot,
  Terminal,
  SquareTerminal,
  MessageSquare,
  BookOpen,
  Settings,
  Brain,
  Compass,
  Anchor,
  Map,
  TrendingUp,
  FileText,
  Download,
  Newspaper,
  Network,
  Inbox,
  Globe,
  MessagesSquare,
  Handshake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  /** Show in the mobile bottom tab bar (Today · Control · Loki · Menu) */
  mobile: boolean;
};

// ─── Individual nav items ─────────────────────────────────────────────────────
// Defined once so SIDEBAR_SECTIONS (groupings) and MOBILE_NAV_ITEMS (filter)
// both consume the same source. Never duplicate an entry.

export const NAV = {
  today: {
    id: "today",
    label: "Today",
    description: "Daily overview & action queue",
    href: "/today",
    icon: Sun,
    active: true,
    mobile: true,
  },
  loki: {
    id: "loki",
    label: "Loki",
    description: "Talk to your fleet — ask or dispatch in plain language",
    href: "/loki",
    icon: MessageSquare,
    active: true,
    mobile: true,
  },
  approvals: {
    id: "approvals",
    label: "Approvals",
    description: "Review & approve actions Loki proposed",
    href: "/approvals",
    icon: Inbox,
    active: true,
    mobile: false,
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    description: "Type directly into a live agent — cloud or this computer",
    href: "/terminal",
    icon: SquareTerminal,
    active: true,
    mobile: false,
  },
  agents: {
    id: "agents",
    label: "Agents",
    description: "Folded into Control — roster and escalations live there",
    href: "/control",
    icon: Network,
    active: true,
    mobile: false,
  },
  control: {
    id: "control",
    label: "Control",
    description: "Command deck — live agent status, dispatch work",
    href: "/control",
    icon: Terminal,
    active: true,
    mobile: true,
  },
  projects: {
    id: "projects",
    label: "Projects",
    description: "Your project catalog — health, context & goals",
    href: "/projects",
    icon: FolderKanban,
    active: true,
    mobile: false,
  },
  feedback: {
    id: "feedback",
    label: "Feedback",
    description: "Visitor & review reports across your fleet — triage and implement",
    href: "/feedback",
    icon: MessagesSquare,
    active: true,
    mobile: false,
  },
  atlas: {
    id: "atlas",
    label: "Atlas",
    description: "Folded into Projects — live URL and down-state live there",
    href: "/projects",
    icon: Globe,
    active: true,
    mobile: false,
  },
  prompts: {
    id: "prompts",
    label: "Prompts",
    description: "Agent prompt library & scheduler",
    href: "/prompts",
    icon: Zap,
    active: true,
    mobile: false,
  },
  activity: {
    id: "activity",
    label: "Activity",
    description: "Project status and event timeline",
    href: "/activity",
    icon: Newspaper,
    active: true,
    mobile: false,
  },
  system: {
    id: "system",
    label: "System",
    description: "Runtime health & scheduled jobs",
    href: "/system",
    icon: Server,
    active: true,
    mobile: false,
  },

  memory: {
    id: "memory",
    label: "Memory",
    description: "Knowledge graph & entity activity",
    href: "/memory",
    icon: Brain,
    active: true,
    mobile: false,
  },
  thoughts: {
    id: "thoughts",
    label: "Thoughts",
    description: "Essays on architecture & systems",
    href: "/thoughts",
    icon: BookOpen,
    active: true,
    mobile: false,
  },

  people: {
    id: "people",
    label: "People",
    description: "Your private address book — every user has their own",
    href: "/people",
    icon: Users,
    active: true,
    mobile: false,
  },
  robots: {
    id: "robots",
    label: "Robots",
    description: "Machines you own — profile, book, rent, or sell",
    href: "/robots",
    icon: Bot,
    active: true,
    mobile: false,
  },
  crew: {
    id: "crew",
    label: "Crew",
    description: "Humans in the loop — assign the work an agent can't do",
    href: "/crew",
    icon: Handshake,
    active: true,
    mobile: false,
  },
  goals: {
    id: "goals",
    label: "Goals",
    description: "Active goals & milestones",
    href: "/goals",
    icon: Target,
    active: true,
    mobile: false,
  },
  habits: {
    id: "habits",
    label: "Habits",
    description: "Daily streaks & 30-day heatmap",
    href: "/habits",
    icon: Repeat2,
    active: true,
    mobile: false,
  },
  events: {
    id: "events",
    label: "Events",
    description: "Deadlines & opportunities",
    href: "/events",
    icon: Calendar,
    active: true,
    mobile: false,
  },
  money: {
    id: "money",
    label: "Money",
    description: "Subscriptions & monthly burn",
    href: "/money",
    icon: Wallet,
    active: true,
    mobile: false,
  },

  download: {
    id: "download",
    label: "Download",
    description: "Get Fleet Runner for your machine",
    href: "/download",
    icon: Download,
    active: true,
    mobile: false,
  },
  mission: {
    id: "mission",
    label: "Mission",
    description: "Why we exist",
    href: "/mission",
    icon: Compass,
    active: true,
    mobile: false,
  },
  philosophy: {
    id: "philosophy",
    label: "Philosophy",
    description: "Principles we build by",
    href: "/philosophy",
    icon: Anchor,
    active: true,
    mobile: false,
  },
  roadmap: {
    id: "roadmap",
    label: "Roadmap",
    description: "Product direction",
    href: "/roadmap",
    icon: Map,
    active: true,
    mobile: false,
  },
  investors: {
    id: "investors",
    label: "Investors",
    description: "For investors",
    href: "/investors",
    icon: TrendingUp,
    active: true,
    mobile: false,
  },
  whitepaper: {
    id: "whitepaper",
    label: "Whitepaper",
    description: "Technical architecture",
    href: "/whitepaper",
    icon: FileText,
    active: true,
    mobile: false,
  },

  settings: {
    id: "settings",
    label: "Settings",
    description: "Profile & team management",
    href: "/settings",
    icon: Settings,
    active: true,
    mobile: false,
  },
} satisfies Record<string, NavItem>;

// ─── Sidebar sections — SSOT for sidebar groupings ────────────────────────────
// Each section has a label header. When `private: true`, the section is hidden
// behind the PIN gate — see SidebarNav.tsx.

export type SidebarSection = {
  id: string;
  label: string;
  items: NavItem[];
  /** Hidden behind the PIN gate when configured + locked. */
  private?: boolean;
};

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: "work",
    // Daily surfaces only. A page earns this seat if you open it with no
    // context: queue (Today), command (Loki), live state (Control), catalog
    // (Projects), inbound reports (Feedback). Destinations live in "more".
    // Agents and Atlas are not pages — roster/escalations sit on Control,
    // live URL on Projects.
    label: "Work",
    items: [NAV.today, NAV.loki, NAV.control, NAV.projects, NAV.feedback],
  },
  {
    id: "more",
    // Reachable from Menu, command palette, FleetSurfaceGuide, and deep
    // links. Not a daily peer of Work — opening them empty is a dead page.
    label: "More",
    items: [NAV.approvals, NAV.terminal, NAV.prompts, NAV.activity, NAV.system, NAV.thoughts],
  },
  {
    id: "private",
    // Personal data — the user's people book, the crew they delegate to,
    // robots, goals, habits, events, money ledger, and the Memory entity graph
    // derived from all of the above. Crew sits here rather than in Work because
    // its roster IS the address book: an assignment leaves the private zone
    // only through a share link, handed over one at a time on purpose.
    // Hidden behind the PIN gate when configured + locked.
    label: "Private",
    private: true,
    items: [
      NAV.memory,
      NAV.people,
      NAV.crew,
      NAV.robots,
      NAV.goals,
      NAV.habits,
      NAV.events,
      NAV.money,
    ],
  },
  {
    id: "site",
    // Public marketing pages, surfaced inside the app shell so logged-in
    // users can reach them without leaving the sidebar.
    label: "Site",
    items: [NAV.download, NAV.mission, NAV.philosophy, NAV.roadmap, NAV.investors, NAV.whitepaper],
  },
];

// Flat list — preserved for places that need every nav item without sections
// (mobile bottom tab bar filter, command palette indexing, etc.).
export const NAV_ITEMS: NavItem[] = SIDEBAR_SECTIONS.flatMap((s) => s.items).concat(NAV.settings);

// ─── Fleet workspace tabs ─────────────────────────────────────────────────────
// These are four views of the same active project. The catalog stays the fleet
// index; a project profile is the persistent context beside the three execution
// surfaces. FleetSurfaceGuide preserves the project between every view.
export const FLEET_SURFACES = [
  { id: "profile", href: NAV.projects.href, label: "Profile" },
  { id: "chat", href: NAV.loki.href, label: "Chat" },
  { id: "control", href: NAV.control.href, label: NAV.control.label },
  { id: "terminal", href: NAV.terminal.href, label: NAV.terminal.label },
] as const;

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile);

// Kept as a named export for any legacy import — same five marketing items
// that already live in the "site" section above.
export const SITE_NAV_ITEMS: NavItem[] = SIDEBAR_SECTIONS.find((s) => s.id === "site")!.items;

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
  Terminal,
  BookOpen,
  Settings,
  Brain,
  History,
  Compass,
  Anchor,
  Map,
  TrendingUp,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  /** Show in the mobile bottom tab bar (3 routes + Ask Ivy + More) */
  mobile: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "today",    label: "Today",    description: "Daily overview & action queue",    href: "/today",    icon: Sun,          active: true,  mobile: true  },
  { id: "control",  label: "Control",  description: "Dispatch agents across projects",  href: "/control",  icon: Terminal,     active: true,  mobile: true  },
  { id: "projects", label: "Projects", description: "Repo health & project context",    href: "/projects", icon: FolderKanban, active: true,  mobile: true  },
  { id: "goals",    label: "Goals",    description: "Active goals & milestones",         href: "/goals",    icon: Target,       active: true,  mobile: false },
  { id: "people",   label: "People",   description: "Social graph & contact health",    href: "/people",   icon: Users,        active: true,  mobile: false },
  { id: "habits",   label: "Habits",   description: "Daily streaks & 30-day heatmap",   href: "/habits",   icon: Repeat2,      active: true,  mobile: false },
  { id: "events",   label: "Events",   description: "Deadlines & opportunities",         href: "/events",   icon: Calendar,     active: true,  mobile: false },
  { id: "money",    label: "Money",    description: "Subscriptions & monthly burn",      href: "/money",    icon: Wallet,       active: true,  mobile: false },
  { id: "history",  label: "History",  description: "Full log of every agent dispatch",  href: "/history",  icon: History,      active: true,  mobile: false },
  { id: "prompts",  label: "Prompts",  description: "Agent prompt library & scheduler", href: "/prompts",  icon: Zap,          active: true,  mobile: false },
  { id: "system",   label: "System",   description: "Runtime health & autopilot jobs",  href: "/system",   icon: Server,       active: true,  mobile: false },
  { id: "memory",   label: "Memory",   description: "Knowledge graph & entity activity", href: "/memory",   icon: Brain,        active: true,  mobile: false },
  { id: "thoughts", label: "Thoughts", description: "Essays on architecture & systems", href: "/thoughts", icon: BookOpen,     active: true,  mobile: false },
  { id: "settings", label: "Settings", description: "Profile & team management",        href: "/settings", icon: Settings,     active: true,  mobile: false },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile);

// Secondary nav — public-facing marketing pages, surfaced in the sidebar
// below the main app sections so logged-in users can reach the marketing
// surface without leaving the app shell.
export const SITE_NAV_ITEMS: NavItem[] = [
  { id: "mission",    label: "Mission",    description: "Why we exist",              href: "/mission",    icon: Compass,    active: true, mobile: false },
  { id: "philosophy", label: "Philosophy", description: "Principles we build by",    href: "/philosophy", icon: Anchor,     active: true, mobile: false },
  { id: "roadmap",    label: "Roadmap",    description: "Product direction",         href: "/roadmap",    icon: Map,        active: true, mobile: false },
  { id: "investors",  label: "Investors",  description: "For investors",             href: "/investors",  icon: TrendingUp, active: true, mobile: false },
  { id: "whitepaper", label: "Whitepaper", description: "Technical architecture",    href: "/whitepaper", icon: FileText,   active: true, mobile: false },
];

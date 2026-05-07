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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  /** Show in the mobile bottom tab bar (max 5 for readability) */
  mobile: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "today",    label: "Today",    description: "Daily overview & action queue",    href: "/today",    icon: Sun,          active: true,  mobile: true  },
  { id: "control",  label: "Control",  description: "Dispatch agents across projects",  href: "/control",  icon: Terminal,     active: true,  mobile: true  },
  { id: "projects", label: "Projects", description: "Repo health & project context",    href: "/projects", icon: FolderKanban, active: true,  mobile: true  },
  { id: "goals",    label: "Goals",    description: "Active goals & milestones",         href: "/goals",    icon: Target,       active: true,  mobile: true  },
  { id: "people",   label: "People",   description: "Social graph & contact health",    href: "/people",   icon: Users,        active: true,  mobile: true  },
  { id: "habits",   label: "Habits",   description: "Daily streaks & 30-day heatmap",   href: "/habits",   icon: Repeat2,      active: true,  mobile: false },
  { id: "events",   label: "Events",   description: "Deadlines & opportunities",         href: "/events",   icon: Calendar,     active: true,  mobile: false },
  { id: "money",    label: "Money",    description: "Subscriptions & monthly burn",      href: "/money",    icon: Wallet,       active: true,  mobile: false },
  { id: "prompts",  label: "Prompts",  description: "Agent prompt library & scheduler", href: "/prompts",  icon: Zap,          active: true,  mobile: false },
  { id: "system",   label: "System",   description: "Runtime health & autopilot jobs",  href: "/system",   icon: Server,       active: true,  mobile: false },
  { id: "thoughts", label: "Thoughts", description: "Essays on architecture & systems", href: "/thoughts", icon: BookOpen,     active: true,  mobile: false },
  { id: "settings", label: "Settings", description: "Profile & team management",        href: "/settings", icon: Settings,     active: true,  mobile: false },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.mobile);

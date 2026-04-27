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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  /** Show in the mobile bottom tab bar (max 5 for readability) */
  mobile: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "today",    label: "Today",    href: "/today",    icon: Sun,          active: true,  mobile: true  },
  { id: "people",   label: "People",   href: "/people",   icon: Users,        active: true,  mobile: true  },
  { id: "goals",    label: "Goals",    href: "/goals",    icon: Target,       active: true,  mobile: true  },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, active: true,  mobile: true  },
  { id: "money",    label: "Money",    href: "/money",    icon: Wallet,       active: true,  mobile: true  },
  { id: "habits",   label: "Habits",   href: "/habits",   icon: Repeat2,      active: true,  mobile: false },
  { id: "events",   label: "Events",   href: "/events",   icon: Calendar,     active: true,  mobile: false },
  { id: "prompts",  label: "Prompts",  href: "/prompts",  icon: Zap,          active: true,  mobile: false },
  { id: "system",   label: "System",   href: "/system",   icon: Server,       active: true,  mobile: false },
  { id: "control",  label: "Control",  href: "/control",  icon: Terminal,     active: true,  mobile: false },
];

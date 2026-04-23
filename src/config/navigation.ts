import {
  Sun,
  Users,
  Wallet,
  Target,
  FolderKanban,
  Server,
  Brain,
  Zap,
  Calendar,
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
  { id: "events",   label: "Events",   href: "/events",   icon: Calendar,     active: true,  mobile: false },
  { id: "prompts",  label: "Prompts",  href: "/prompts",  icon: Zap,          active: true,  mobile: false },
  { id: "system",   label: "System",   href: "/system",   icon: Server,       active: true,  mobile: false },
  { id: "memory",   label: "Memory",   href: "/memory",   icon: Brain,        active: true,  mobile: false },
];

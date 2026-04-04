import {
  Sun,
  Users,
  Wallet,
  Target,
  FolderKanban,
  Server,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", href: "/today", icon: Sun, active: true },
  { id: "people", label: "People", href: "/people", icon: Users, active: true },
  { id: "money", label: "Money", href: "/money", icon: Wallet, active: false },
  { id: "goals", label: "Goals", href: "/goals", icon: Target, active: false },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, active: false },
  { id: "system", label: "System", href: "/system", icon: Server, active: false },
  { id: "memory", label: "Memory", href: "/memory", icon: Brain, active: false },
];

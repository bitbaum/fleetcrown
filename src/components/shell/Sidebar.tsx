"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-72 md:flex-col border-r border-border-subtle bg-sidebar/80 backdrop-blur-xl">
      <div className="flex h-24 items-center justify-between px-6 border-b border-border-subtle">
        <div>
          <p className="ui-kicker">Life OS</p>
          <span className="mt-1 block text-3xl font-medium text-text-primary">Cockpit</span>
        </div>
        <ThemeToggle />
      </div>
      <nav className="flex-1 space-y-1.5 px-3 py-5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "ui-nav-item",
                isActive
                  ? "ui-nav-item-active"
                  : "",
                !item.active && "opacity-40"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <span className="block">{item.label}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{item.description}</span>
              </div>
              {!item.active && (
                <span className="ml-auto ui-micro-label">soon</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border-subtle px-3 py-4">
        <button
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text-secondary"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AskIvyButton } from "./AskIvyButton";
import {
  SIDEBAR_COLLAPSE_BREAKPOINT,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
} from "@/config/shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Hydrate from localStorage on mount — deferred so server and client agree on initial render.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
      if (stored !== null) {
        setSidebarCollapsed(stored === "true"); // eslint-disable-line react-hooks/set-state-in-effect
      } else {
        setSidebarCollapsed(window.innerWidth < SIDEBAR_COLLAPSE_BREAKPOINT);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(sidebarCollapsed));
    } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  return (
    <div className="app-shell-frame flex min-h-screen bg-surface-page text-text-primary">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <main className="app-main">
        {children}
      </main>
      <MobileNav />
      <AskIvyButton />
    </div>
  );
}

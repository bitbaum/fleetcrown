"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes SSR hydration guard
  useEffect(() => setMounted(true), []);

  // Render stable placeholder until mounted to avoid SSR/client mismatch
  if (!mounted) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-2xl border border-border-subtle bg-surface-base/80",
          compact ? "h-10 w-10 justify-center" : "h-11 w-full px-4",
        )}
      />
    );
  }

  const isDark = resolvedTheme !== "light";
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex items-center rounded-2xl border border-border-subtle bg-surface-base/80 text-text-secondary transition hover:bg-surface-raised hover:text-text-primary",
        compact ? "h-10 w-10 justify-center" : "h-11 w-full justify-between px-4",
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span className="text-sm font-medium text-text-secondary">{label}</span>}
    </button>
  );
}

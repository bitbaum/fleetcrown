"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

// SSOT for the Light / Dark / Auto switch. Used both in Settings → Appearance
// (with labels) and in the sidebar footer (icon-only) so theme is discoverable
// without digging into Settings. "Auto" = next-themes "system" (follow OS).
export const THEME_OPTIONS = [
  { value: "light",  label: "Light", icon: Sun     },
  { value: "dark",   label: "Dark",  icon: Moon    },
  { value: "system", label: "Auto",  icon: Monitor },
] as const;

export function ThemeToggle({
  showLabels = false,
  className,
}: {
  showLabels?: boolean;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes SSR hydration guard
  useEffect(() => setMounted(true), []);

  return (
    <div role="group" aria-label="Theme" className={cn("ui-theme-toggle", className)}>
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            title={`${opt.label} theme`}
            className={cn("ui-theme-toggle-btn", showLabels && "flex-1", active && "ui-theme-toggle-btn-active")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabels && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

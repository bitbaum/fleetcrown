"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/brand";

const THEME_OPTIONS = [
  { value: "light",  label: "Light",  icon: Sun     },
  { value: "dark",   label: "Dark",   icon: Moon    },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes SSR hydration guard
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6">
      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Theme</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Choose how {APP_NAME} looks. System follows your OS preference.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = mounted && theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  active
                    ? "border-border-interactive bg-surface-raised text-text-primary"
                    : "border-border-subtle bg-surface-base text-text-secondary hover:border-border-default hover:text-text-primary",
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

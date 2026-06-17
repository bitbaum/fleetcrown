"use client";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { APP_NAME } from "@/config/brand";

export function AppearanceSettings() {
  return (
    <div className="space-y-6">
      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Theme</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Choose how {APP_NAME} looks. Auto follows your OS preference. (Also in the sidebar.)
          </p>
        </div>
        <ThemeToggle showLabels />
      </div>
    </div>
  );
}

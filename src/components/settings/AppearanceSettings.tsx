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
            Choose how {APP_NAME} looks. Auto follows your OS preference. Tap the sun/moon
            icon in the top bar or sidebar to cycle modes quickly.
          </p>
        </div>
        <ThemeToggle variant="select" />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Code block + one-click copy button for terminal commands shown in onboarding flows.
 * Lives under components/control/ because that's where the import flows live;
 * promote to components/ui/ if a second feature needs it.
 */
export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; user can fall back to manual select-all.
    }
  }

  return (
    <div className="relative">
      <pre className="ui-card-shell p-3 pr-10 overflow-x-auto text-xs text-text-secondary whitespace-pre-wrap break-all">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 ui-btn-icon"
        aria-label="Copy command"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-status-positive" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

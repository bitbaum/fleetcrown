"use client";

import { Copy, Check } from "lucide-react";
import { useClipboard } from "@/hooks/use-clipboard";

/**
 * Code block + one-click copy button for terminal commands shown in onboarding flows.
 * Lives under components/control/ because that's where the import flows live;
 * promote to components/ui/ if a second feature needs it.
 */
export function CopyableCommand({ command }: { command: string }) {
  const { copied, copy } = useClipboard();

  function handleCopy() {
    copy(command);
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

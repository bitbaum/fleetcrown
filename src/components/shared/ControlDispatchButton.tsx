"use client";

import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";

export function ControlDispatchButton({
  tab,
  className = "flex items-center gap-1 text-text-muted hover:text-accent-text transition-colors",
}: {
  tab: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        // "control:prefill" was a dead write — nothing ever read it, so the
        // prompt silently vanished. Deep-link to the project's card instead
        // (the same ?focus= path push notifications use).
        router.push(`/control?focus=${encodeURIComponent(tab)}`);
      }}
      className={className}
      title="Send to Control agent"
    >
      <Bot className="h-3 w-3" />
      <span className="text-xs">Agent</span>
    </button>
  );
}

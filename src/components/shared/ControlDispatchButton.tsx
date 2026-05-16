"use client";

import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";

export function ControlDispatchButton({
  tab,
  prompt,
  className = "flex items-center gap-1 text-text-muted hover:text-accent-text transition-colors",
}: {
  tab: string;
  prompt: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        localStorage.setItem("control:prefill", JSON.stringify({ tab, prompt }));
        router.push("/control");
      }}
      className={className}
      title="Send to Control agent"
    >
      <Bot className="h-3 w-3" />
      <span className="text-xs">Agent</span>
    </button>
  );
}

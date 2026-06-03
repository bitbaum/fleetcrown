"use client";

import { useState } from "react";
import { CheckCircle, Send } from "lucide-react";
import { FEEDBACK_SHORT_MS } from "@/lib/constants/timings";

export function IvyDispatchButton({
  prompt,
  title = "Ask Ivy",
  className = "shrink-0 p-0.5 rounded text-text-muted hover:text-status-positive transition-colors",
  label,
}: {
  prompt: string;
  title?: string;
  className?: string;
  label?: string;
}) {
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    window.dispatchEvent(new CustomEvent("ivy:open", { detail: { prompt } }));
    setSent(true);
    setTimeout(() => setSent(false), FEEDBACK_SHORT_MS);
  };

  return (
    <button onClick={handleSend} className={className} title={title}>
      {sent
        ? <CheckCircle className="h-3 w-3 text-status-positive" />
        : <Send className="h-3 w-3" />
      }
      {label && <span>{sent ? "Sent" : label}</span>}
    </button>
  );
}

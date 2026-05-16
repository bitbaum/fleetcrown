"use client";

import { useState } from "react";
import { CheckCircle, Send } from "lucide-react";

export function IvyDispatchButton({
  prompt,
  title = "Ask Ivy",
  className = "shrink-0 p-0.5 rounded text-text-muted hover:text-status-positive transition-colors",
}: {
  prompt: string;
  title?: string;
  className?: string;
}) {
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    window.dispatchEvent(new CustomEvent("ivy:open", { detail: { prompt } }));
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };

  return (
    <button onClick={handleSend} className={className} title={title}>
      {sent
        ? <CheckCircle className="h-3 w-3 text-status-positive" />
        : <Send className="h-3 w-3" />
      }
    </button>
  );
}

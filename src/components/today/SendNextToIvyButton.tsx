"use client";

import { useState } from "react";
import { CheckCircle, Send } from "lucide-react";

export function SendNextToIvyButton({ projectKey, next }: { projectKey: string; next: string }) {
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    const prompt = `Project: ${projectKey}\nAgent recommended next step: ${next}\n\nPlease help me execute this next step.`;
    window.dispatchEvent(new CustomEvent("ivy:open", { detail: { prompt } }));
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };

  return (
    <button
      onClick={handleSend}
      className="shrink-0 p-0.5 rounded text-text-muted hover:text-status-positive transition-colors"
      title="Ask Ivy to execute this next step"
    >
      {sent
        ? <CheckCircle className="h-3 w-3 text-status-positive" />
        : <Send className="h-3 w-3" />
      }
    </button>
  );
}

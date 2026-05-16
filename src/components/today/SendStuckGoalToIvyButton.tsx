"use client";

import { useState } from "react";
import { CheckCircle, Send } from "lucide-react";

export function SendStuckGoalToIvyButton({ title, idleDays }: { title: string; idleDays: number }) {
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    const prompt = `Goal: ${title}\nProgress: 0%\nIdle for ${idleDays} days with no progress.\n\nThis goal has been completely stalled. What is the single smallest concrete step I can take right now to get it moving?`;
    window.dispatchEvent(new CustomEvent("ivy:open", { detail: { prompt } }));
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };

  return (
    <button
      onClick={handleSend}
      className="shrink-0 p-0.5 rounded text-text-muted hover:text-status-positive transition-colors"
      title="Ask Ivy to unblock this goal"
    >
      {sent
        ? <CheckCircle className="h-3 w-3 text-status-positive" />
        : <Send className="h-3 w-3" />
      }
    </button>
  );
}

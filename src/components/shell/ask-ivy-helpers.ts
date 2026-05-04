import { useState, useEffect } from "react";
import { PROMPT_TEMPLATES, GLOBAL_PROMPTS } from "@/config/prompt-library";

export type Message = {
  role: "user" | "ivy";
  text: string;
  durationMs?: number;
  model?: string;
  error?: boolean;
};

export const QUICK_PROMPTS = PROMPT_TEMPLATES.filter((t) => t.featured && t.scope === "global").concat(
  PROMPT_TEMPLATES.filter((t) => t.featured && t.scope === "project").slice(0, 4)
);

export { GLOBAL_PROMPTS };

export function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setElapsed(0));
    if (!active) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

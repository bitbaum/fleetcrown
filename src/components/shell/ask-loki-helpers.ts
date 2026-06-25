import { useState, useEffect } from "react";
export { GLOBAL_PROMPTS, QUICK_PROMPTS } from "@/config/prompt-library";

export type Message = {
  role: "user" | "loki";
  text: string;
  durationMs?: number;
  model?: string;
  error?: boolean;
};

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

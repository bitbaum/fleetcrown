"use client";

// "Discuss with Loki" — a reasoning-partner chat scoped to THIS project. Loki
// gets the project's brief + goals as context (first turn) and keeps a per-project
// thread, so you can pressure-test decisions, draft milestones, or ask "what's the
// riskiest assumption here?" without leaving the project. A third interaction mode
// alongside command (Control) and configure (brief) — converse.

import { useState, useRef, useEffect } from "react";
import { Loader2, MessagesSquare, Send, Sparkles } from "lucide-react";
import { postJson } from "@/lib/api/fetch";

type Msg = { role: "you" | "loki"; text: string; via?: string };

const STARTERS = [
  "What's the riskiest assumption in this project right now?",
  "Draft acceptance criteria for the next milestone.",
  "What am I missing?",
];

export function ProjectLokiChat({ projectKey }: { projectKey: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstTurn = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { role: "you", text: q }]);
    setBusy(true);
    try {
      const res = await postJson("/api/loki", { message: q, projectKey, includeContext: firstTurn.current });
      const json = (await res.json()) as { ok?: boolean; text?: string; via?: string; model?: string; error?: string };
      if (!res.ok || !json.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      firstTurn.current = false;
      setMsgs((m) => [...m, { role: "loki", text: json.text ?? "", via: json.via }]);
    } catch { setError("Network error — try again"); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ui-btn-chip gap-1.5 px-3 py-1.5 text-xs"
        title="Talk to Loki about this project — its brief and goals are loaded as context."
      >
        <MessagesSquare className="h-3.5 w-3.5 text-accent-text" />
        Discuss with Loki
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-3">
      <div className="flex items-center gap-1.5">
        <MessagesSquare className="h-3.5 w-3.5 text-accent-text" />
        <span className="ui-micro-label">Discuss {projectKey} with Loki</span>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {msgs.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-text-muted">Loki has this project&apos;s brief + goals. Ask anything, or start with:</p>
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-md border border-border-subtle px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-overlay">
                <Sparkles className="mr-1 inline h-3 w-3 text-accent-text" />{s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "you" ? "text-right" : ""}>
            <span className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-xs ${m.role === "you" ? "bg-accent-muted text-text-primary" : "bg-surface-overlay text-text-secondary"}`}>
              {m.text}
              {m.via === "groq-fallback" && <span className="ml-1.5 text-nano text-status-warning">(degraded: Groq)</span>}
            </span>
          </div>
        ))}
        {busy && <div className="flex items-center gap-1.5 text-xs text-text-muted"><Loader2 className="ui-spinner-xs" /> Loki is thinking…</div>}
        <div ref={endRef} />
      </div>

      {error && <p className="ui-error-xs">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={`Ask Loki about ${projectKey}…`}
          className="ui-input flex-1 text-xs"
          disabled={busy}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="ui-btn-save gap-1.5">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

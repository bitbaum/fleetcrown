"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BeaconSession = {
  id: string;
  project: string;
  sessionContent: string;
  createdAt: number;
  choice: string | null;
};

type AgentPrompt = {
  key: string;
  slot: number | null;
  icon: string;
  label: string;
  style: "primary" | "action" | "more" | "dimension" | "internal";
  category: string;
  dimensionId: string | null;
  prompt: string;
};

type ParsedSession = {
  done: string[];
  next: string[];
  in_progress: string[];
  tests: string;
  todos: string;
  health: string;
};

function parseSession(content: string): ParsedSession {
  const result: ParsedSession = { done: [], next: [], in_progress: [], tests: "", todos: "", health: "" };
  for (const line of content.split("\n")) {
    if (!line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const k = rawKey.trim().toLowerCase();
    const v = rest.join(":").trim();
    if (k === "done") result.done = v.split(";").map((s) => s.trim()).filter(Boolean);
    else if (k === "next") result.next = v.split(";").map((s) => s.trim()).filter(Boolean);
    else if (k === "in_progress") result.in_progress = v.split(";").map((s) => s.trim()).filter(Boolean);
    else if (k === "tests") result.tests = v;
    else if (k === "todos") result.todos = v;
    else if (k === "health") result.health = v;
  }
  return result;
}

function SessionSummary({ content }: { content: string }) {
  const s = parseSession(content);
  const [doneOpen, setDoneOpen] = useState(false);
  if (!content.trim()) return null;

  return (
    <div className="ui-panel rounded-2xl p-5 space-y-4">
      {s.next.length > 0 && (
        <div className="space-y-2">
          <p className="ui-kicker text-[10px] tracking-widest">Up Next</p>
          {s.next.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" />
              <span className="text-sm leading-relaxed text-text-primary">{item}</span>
            </div>
          ))}
        </div>
      )}
      {s.in_progress.length > 0 && (
        <div className="space-y-2">
          <p className="ui-kicker text-[10px] tracking-widest text-status-warning">In Progress</p>
          {s.in_progress.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-status-warning" />
              <span className="text-sm leading-relaxed text-text-secondary">{item}</span>
            </div>
          ))}
        </div>
      )}
      {s.done.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setDoneOpen((v) => !v)}
            className="flex w-full items-center gap-2 py-1"
          >
            <p className="ui-kicker text-[10px] tracking-widest text-text-muted">
              Done · {s.done.length} completed
            </p>
            <span className="ml-auto text-xs text-text-muted">{doneOpen ? "▾" : "▸"}</span>
          </button>
          {doneOpen && (
            <div className="space-y-1.5 pt-1">
              {s.done.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-positive" />
                  <span className="text-xs leading-relaxed text-text-tertiary">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BeaconPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BeaconSession | null>(null);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [custom, setCustom] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/beacon/${id}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
    fetch("/api/prompts/agent")
      .then((r) => r.json())
      .then(setPrompts)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const submit = useCallback(async (choice: string) => {
    if (submitted) return;
    setSubmitted(true);
    await fetch(`/api/beacon/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    }).catch(() => {});
    setTimeout(() => window.close(), 400);
  }, [id, submitted]);

  // Auto-submit first primary prompt on countdown
  useEffect(() => {
    if (!session || submitted) return;
    const primary = prompts.find((p) => p.style === "primary" && p.slot === 1);
    if (!primary) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          submit(String(primary.slot ?? "1"));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [session, prompts, submit, submitted]);

  // Cancel countdown on any custom input
  const handleCustomChange = (v: string) => {
    setCustom(v);
    if (v) setCountdown(0);
  };

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-page">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-page">
        <Check className="h-8 w-8 text-status-positive" />
        <p className="text-sm text-text-secondary">Running…</p>
      </div>
    );
  }

  const primaryPrompts = prompts.filter((p) => p.style === "primary");
  const actionPrompts = prompts.filter((p) => p.style === "action");
  const morePrompts = prompts.filter((p) => p.style === "more");

  return (
    <div className="min-h-screen bg-surface-page p-4 sm:p-6">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="ui-kicker text-[10px] tracking-widest">Session complete</p>
            <h1 className="mt-1 text-xl font-bold text-text-primary">{session.project}</h1>
          </div>
          <span className="ui-tag ui-tag-positive">● done</span>
        </div>

        {/* Session summary */}
        {session.sessionContent && (
          <SessionSummary content={session.sessionContent} />
        )}

        {/* Primary actions */}
        {primaryPrompts.length > 0 && (
          <div className="space-y-2">
            {primaryPrompts.map((p) => (
              <button
                key={p.key}
                onClick={() => submit(String(p.slot ?? p.key))}
                className="ui-btn-primary w-full justify-start gap-3 px-4 py-3 text-left text-[0.9375rem]"
              >
                <span className="text-base leading-none">{p.icon}</span>
                <span className="flex-1">{p.label}</span>
                {countdown > 0 && p.slot === 1 && (
                  <span className="ml-auto text-xs opacity-60">{countdown}s</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {actionPrompts.length > 0 && (
          <div className="space-y-1.5">
            {actionPrompts.map((p) => (
              <button
                key={p.key}
                onClick={() => submit(String(p.slot ?? p.key))}
                className="ui-btn-secondary w-full justify-start gap-3 px-4 py-2.5 text-left"
              >
                <span className="text-sm leading-none">{p.icon}</span>
                <span className="text-sm">{p.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* More */}
        {morePrompts.length > 0 && (
          <div>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="flex items-center gap-2 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <span>{moreOpen ? "▾" : "▸"}</span>
              More prompts ({morePrompts.length})
            </button>
            {moreOpen && (
              <div className="mt-1.5 space-y-1">
                {morePrompts.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => submit(String(p.slot ?? p.key))}
                    className="w-full rounded-xl px-4 py-2 text-left text-sm text-text-tertiary hover:bg-surface-raised hover:text-text-primary transition-colors"
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Custom input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={custom}
            onChange={(e) => handleCustomChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && custom.trim() && submit(`custom:${custom.trim()}`)}
            placeholder="Custom prompt…"
            className="ui-input flex-1"
          />
          <button
            onClick={() => custom.trim() && submit(`custom:${custom.trim()}`)}
            disabled={!custom.trim()}
            className="ui-btn-primary px-4 disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => window.close()}
          className="w-full py-2 text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Dismiss  ·  Esc
        </button>
      </div>
    </div>
  );
}

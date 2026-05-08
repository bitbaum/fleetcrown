"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, Check, ArrowRight, ExternalLink,
  X, ChevronUp, ChevronDown, Send, ListPlus, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useWhisperMic } from "@/hooks/use-whisper-mic";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { parseSessionText } from "@/lib/session-content";

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

function SessionSummary({ content }: { content: string }) {
  const s = parseSessionText(content);
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

function readCountdownParam(): number {
  if (typeof window === "undefined") return 12;
  const raw = new URLSearchParams(window.location.search).get("countdown");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : 12;
}

// ─── BeaconBody ─────────────────────────────────────────────────────────────
// Owns all interactive state for a loaded session. Keeping it separate ensures
// usePromptQueue is called exactly once per project key in this window.

function BeaconBody({
  session,
  prompts,
  onSubmitted,
}: {
  session: BeaconSession;
  prompts: AgentPrompt[];
  onSubmitted: (label: string) => void;
}) {
  const { queue, enqueue, remove, reorder, edit } = usePromptQueue(session.project.toLowerCase());
  const [custom, setCustom] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(true);
  const [countdown, setCountdown] = useState(readCountdownParam);
  const [queueEditingIndex, setQueueEditingIndex] = useState<number | null>(null);
  const [queueEditText, setQueueEditText] = useState("");
  const queueEditRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  // Sync paused state from localStorage — queue is owned by usePromptQueue above.
  useEffect(() => {
    const tab = session.project.toLowerCase();
    const sync = () => {
      try {
        setAutoContinueEnabled(localStorage.getItem(`control:auto-continue:${tab}`) !== "off");
      } catch { /* ignore */ }
    };
    sync();
    const interval = setInterval(sync, 2000);
    window.addEventListener("storage", sync);
    return () => { clearInterval(interval); window.removeEventListener("storage", sync); };
  }, [session.project]);

  // Display-only countdown — Cockpit's control panel is the actual inject authority.
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appendTranscript = useCallback((text: string) => {
    setCustom((prev) => (prev ? `${prev} ${text}` : text).trim());
    inputRef.current?.focus();
  }, []);

  const { listening, processing, error: micError, toggle: toggleMic, waveformBars, recordingSeconds } =
    useWhisperMic(appendTranscript);

  const submit = useCallback(async (choice: string) => {
    const all = promptsRef.current;
    let label = "";
    if (choice.startsWith("custom:")) {
      label = choice.slice("custom:".length).trim();
    } else {
      const slot = parseInt(choice);
      const matched = all.find((p) => p.slot === slot) ?? all.find((p) => p.key === choice);
      label = matched ? `${matched.icon} ${matched.label}` : choice;
    }
    onSubmitted(label);
    await fetch(`/api/beacon/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    }).catch(() => {});
    setTimeout(() => window.close(), 400);
  }, [session.id, onSubmitted]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

  // Keyboard: Esc close · 1–9 direct slot pick
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === "Escape") { window.close(); return; }
      const n = parseInt(e.key);
      if (!isNaN(n) && n >= 1 && n <= 9) {
        const all = [
          ...promptsRef.current.filter((p) => p.style === "primary"),
          ...promptsRef.current.filter((p) => p.style === "action"),
        ];
        const target = all.find((p) => p.slot === n) ?? all[n - 1];
        if (target) submitRef.current(String(target.slot ?? target.key));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSendCustom = () => {
    if (!custom.trim()) return;
    submit(`custom:${custom.trim()}`);
    setCustom("");
  };

  const handleEnqueue = () => {
    if (!custom.trim()) return;
    enqueue(custom.trim());
    setCustom("");
  };

  const confirmQueueEdit = (i: number) => {
    edit(i, queueEditText);
    setQueueEditingIndex(null);
  };

  const primaryPrompts = prompts.filter((p) => p.style === "primary");
  const actionPrompts = prompts.filter((p) => p.style === "action");
  const morePrompts = prompts.filter((p) => p.style === "more");

  const wordCount = custom.trim() ? custom.trim().split(/\s+/).length : 0;
  const charCount = custom.length;

  return (
    <div className="space-y-4">
      {/* Session summary */}
      {session.sessionContent && <SessionSummary content={session.sessionContent} />}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-base px-3 py-2.5 space-y-1">
          <p className="ui-kicker mb-2">Up next · {queue.length}</p>
          {queue.map((prompt, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={cn(
                "mt-[3px] shrink-0 text-[10px] font-bold tabular-nums",
                i === 0 ? "text-accent-text" : "text-text-muted",
              )}>
                {i + 1}
              </span>

              {queueEditingIndex === i ? (
                <textarea
                  ref={queueEditRef}
                  value={queueEditText}
                  onChange={(e) => setQueueEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmQueueEdit(i); }
                    if (e.key === "Escape") setQueueEditingIndex(null);
                  }}
                  onBlur={() => confirmQueueEdit(i)}
                  rows={2}
                  className="ui-input flex-1 resize-none text-sm"
                  style={{ fieldSizing: "content", maxHeight: "6rem" } as React.CSSProperties}
                />
              ) : (
                <button
                  onClick={() => { remove(i); submit(`custom:${prompt}`); }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setQueueEditingIndex(i);
                    setQueueEditText(prompt);
                    setTimeout(() => queueEditRef.current?.focus(), 0);
                  }}
                  title="Click to send · Double-click to edit"
                  className={cn(
                    "flex-1 text-left text-sm leading-snug transition-colors hover:text-text-primary",
                    i === 0 ? "text-text-primary" : "text-text-tertiary",
                  )}
                >
                  {prompt}
                </button>
              )}

              <div className="shrink-0 flex flex-col gap-0.5 pt-0.5">
                <button onClick={() => reorder(i, i - 1)} disabled={i === 0}
                  className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary disabled:opacity-0" title="Move up">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onClick={() => reorder(i, i + 1)} disabled={i === queue.length - 1}
                  className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary disabled:opacity-0" title="Move down">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button onClick={() => remove(i)}
                  className="rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary" title="Remove">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary action */}
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
              {p.slot === 1 && (
                !autoContinueEnabled
                  ? <span className="ml-auto shrink-0 rounded-md bg-black/20 px-2 py-0.5 text-xs">⏸ Paused</span>
                  : countdown > 0
                  ? <span className="ml-auto shrink-0 rounded-md bg-black/20 px-2 py-0.5 font-mono text-xs tabular-nums">⚡ {countdown}s</span>
                  : null
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

      {/* Status line */}
      <p className="text-[11px] text-text-tertiary">
        {custom.trim()
          ? "Enter to send · Alt+Enter to queue"
          : !autoContinueEnabled
          ? "Auto-continue is paused · enable in Cockpit to resume"
          : countdown > 0
          ? `Cockpit continues in ${countdown}s · click to choose`
          : "Continuing via Cockpit…"}
      </p>

      {/* Custom input — matches control panel PromptInput */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              value={custom}
              rows={1}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (e.altKey) handleEnqueue();
                  else handleSendCustom();
                }
              }}
              placeholder={
                listening ? "Recording… click mic to stop"
                : processing ? "Transcribing…"
                : "Custom prompt…"
              }
              className={cn(
                "ui-input w-full resize-none pr-10",
                listening && "border-status-negative/40",
                processing && "border-accent-primary/30",
              )}
              style={{ fieldSizing: "content", maxHeight: "8rem" } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={toggleMic}
              disabled={processing}
              title={listening ? "Stop recording" : "Voice input (Whisper)"}
              className={cn(
                "absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors",
                listening
                  ? "text-status-negative animate-pulse hover:bg-status-negative/10"
                  : processing
                  ? "text-text-muted opacity-50"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface-raised",
              )}
            >
              {processing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : listening
                ? <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                : <Mic className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={handleEnqueue}
              disabled={!custom.trim()}
              title="Add to queue (runs after current task) · Alt+Enter"
              className="ui-icon-action min-h-11 rounded-xl border border-border-default px-3 disabled:opacity-40"
            >
              <ListPlus className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendCustom}
              disabled={!custom.trim()}
              className="ui-btn-lg inline-flex min-h-11 items-center justify-center py-3.5 sm:px-5 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mic status row */}
        {(micError || listening || processing) && (
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center">
              {micError && <p className="text-[11px] text-status-negative">{micError}</p>}
              {listening && !micError && (() => {
                const flat = recordingSeconds >= 2 && waveformBars.every((b) => b < 0.02);
                const secs = recordingSeconds;
                const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
                return flat
                  ? <p className="text-[11px] text-status-warning">No audio — speak closer or raise mic volume</p>
                  : <p className="text-[11px] text-status-negative">Recording · {label}</p>;
              })()}
              {processing && !micError && (
                <p className="text-[11px] text-text-tertiary animate-pulse">Transcribing…</p>
              )}
            </div>
            {listening && !micError && (
              <div className="flex items-end gap-[2px]" style={{ height: 16 }}>
                {waveformBars.map((h, i) => (
                  <div key={i} className="rounded-full bg-status-negative"
                    style={{ width: 2, height: Math.max(2, Math.round(h * 14)), transition: "height 75ms ease" }} />
                ))}
              </div>
            )}
            {!listening && custom && (
              <p className="text-[11px] tabular-nums text-text-muted">{wordCount}w · {charCount}c</p>
            )}
          </div>
        )}
        {!micError && !listening && !processing && custom && (
          <div className="flex justify-end px-0.5">
            <p className="text-[11px] tabular-nums text-text-muted">{wordCount}w · {charCount}c</p>
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => window.close()}
        className="w-full py-2 text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        Dismiss · Esc
      </button>
    </div>
  );
}

// ─── BeaconPage ──────────────────────────────────────────────────────────────

export default function BeaconPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BeaconSession | null>(null);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedLabel, setSubmittedLabel] = useState("");

  useEffect(() => {
    fetch(`/api/beacon/${id}`).then((r) => r.json()).then(setSession).catch(() => {});
    fetch("/api/prompts/agent").then((r) => r.json()).then(setPrompts).catch(() => {});
  }, [id]);

  // Close automatically if the Control panel injected a prompt and cancelled this session.
  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/beacon/${id}`);
        const data = (await res.json()) as BeaconSession;
        if (data.choice !== null) window.close();
      } catch { /* network error — ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [id, submitted]);

  // Auto-fit Chrome app window to content height + reposition to bottom-right
  useEffect(() => {
    if (!session || prompts.length === 0) return;
    const fit = () => {
      const h = Math.min(document.documentElement.scrollHeight + 2, 900);
      const w = 520;
      try {
        const right  = window.screenLeft + window.outerWidth;
        const bottom = window.screenTop  + window.outerHeight;
        window.resizeTo(w, h);
        window.moveTo(right - w, Math.max(bottom - h, 16));
      } catch { /* blocked in non-popup windows */ }
    };
    const t = setTimeout(fit, 120);
    return () => clearTimeout(t);
  }, [session, prompts]);

  if (!session) {
    return (
      <div className="flex h-64 items-center justify-center bg-surface-page">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-surface-page p-6">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-positive/15">
              <Check className="h-5 w-5 text-status-positive" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-status-positive">Dispatched</p>
              <p className="mt-0.5 text-base font-semibold text-text-primary">
                {submittedLabel || "Agent running…"}
              </p>
            </div>
          </div>
          <div className="ui-panel rounded-xl p-4 space-y-2">
            <p className="text-sm text-text-secondary">
              Claude is now executing this task for <span className="font-medium text-text-primary">{session.project}</span>.
            </p>
            <p className="text-xs text-text-tertiary">
              Watch progress in the Control panel — this window will close automatically.
            </p>
          </div>
          <button
            onClick={() => window.open("http://localhost:3000/control", "_blank")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle py-2.5 text-sm text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Control panel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-page p-4 sm:p-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="ui-kicker text-[10px] tracking-widest">Session complete</p>
            <h1 className="mt-1 text-xl font-bold text-text-primary">{session.project}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open("http://localhost:3000/control", "_blank")}
              title="Open Cockpit control panel"
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-border-default hover:text-text-secondary"
            >
              <ExternalLink className="h-3 w-3" />
              Cockpit
            </button>
            <ThemeToggle compact />
            <span className="ui-tag ui-tag-positive">● done</span>
          </div>
        </div>

        <BeaconBody
          session={session}
          prompts={prompts}
          onSubmitted={(label) => { setSubmitted(true); setSubmittedLabel(label); }}
        />
      </div>
    </div>
  );
}

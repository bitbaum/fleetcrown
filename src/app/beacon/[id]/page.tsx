"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, Check, ArrowRight, ExternalLink,
  Pause, Play, Mic, ListPlus, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useMicComposer } from "@/hooks/use-mic-composer";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { QueueList } from "@/components/control/project-composer";
import { PROMPT_STYLE } from "@/lib/constants/control";
import { parseSessionText } from "@/lib/session-content";
import { DEFAULT_BEACON_COUNTDOWN_S, CUSTOM_CHOICE_PREFIX, AUTO_INJECT_S } from "@/lib/constants/control";
import { readyAtKey } from "@/lib/control-storage";
import type { BeaconSession } from "@/app/api/beacon/route";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";

function SessionSummary({ content }: { content: string }) {
  const s = parseSessionText(content);
  const [doneOpen, setDoneOpen] = useState(false);
  if (!content.trim()) return null;

  return (
    <div className="ui-panel rounded-2xl p-5 space-y-4">
      {s.next.length > 0 && (
        <div className="space-y-2">
          <p className="ui-kicker text-[10px] tracking-widest">Agent&apos;s plan</p>
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
  if (typeof window === "undefined") return DEFAULT_BEACON_COUNTDOWN_S;
  const raw = new URLSearchParams(window.location.search).get("countdown");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : DEFAULT_BEACON_COUNTDOWN_S;
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
  const { queue, enqueue, remove, reorder, edit } = usePromptQueue(session.project);
  // Always reset auto-continue to ON when the beacon opens — it's a fresh one-shot popup.
  // The beacon may open before the control panel has had a chance to reset a stale "off"
  // state, causing the countdown to start paused and beacon.py to time out without injecting.
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue, enable: enableAutoContinue } = useAutoContinue(session.project);
  useEffect(() => { enableAutoContinue(); }, [enableAutoContinue]);
  const [custom, setCustom] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [countdown, setCountdown] = useState(() => {
    // Initialise from the shared readyAt timestamp written by the control panel
    // so both views count down from the same origin and show the same number.
    try {
      const stored = localStorage.getItem(readyAtKey(session.project));
      if (stored) {
        const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000);
        return Math.max(0, AUTO_INJECT_S - elapsed);
      }
    } catch {}
    return readCountdownParam();
  });
  const autoFiredRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  // useMicComposer must be declared before isComposing so listening/processing are available.
  const { listening, processing, micError, toggleMic, waveformBars, recordingSeconds, maxRecordingSeconds, wrapSend, wrapEnqueue } = useMicComposer({
    custom,
    onAppend: (newText) => { setCustom(newText); inputRef.current?.focus(); },
    onSendAfterRecording: (text) => submitRef.current(`${CUSTOM_CHOICE_PREFIX}${text}`),
    onEnqueueAfterRecording: enqueue,
  });

  // Countdown pauses when auto-continue is off, user is typing/composing, mic is active, or
  // prompts haven't loaded yet. Mic states (listening + processing) are explicitly included so
  // the countdown never fires while the user is speaking — the transcript isn't in the textarea
  // yet and isComposing would be false without them.
  const isComposing = custom.trim().length > 0 || listening || processing;
  useEffect(() => {
    if (!autoContinueEnabled || isComposing || countdown <= 0 || prompts.length === 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinueEnabled, isComposing, prompts.length]);

  useEffect(() => {
    // Guard: don't fire before prompts are loaded or while mic is active.
    if (!autoContinueEnabled || countdown !== 0 || autoFiredRef.current || prompts.length === 0 || listening || processing) return;
    // 1s grace period before firing: the control panel's auto-inject fires at the same second
    // and cancels this session via /api/inject → cancelActiveBeaconSessions. Waiting 1s gives
    // the cancel time to propagate and the 500ms close-poll time to detect it and close this
    // window before the auto-fire runs, eliminating the double-inject race.
    const t = setTimeout(() => {
      if (autoFiredRef.current) return;
      autoFiredRef.current = true;
      const primary = prompts.find((p) => p.style === "primary");
      const choice = queue.length > 0
        ? `${CUSTOM_CHOICE_PREFIX}${queue[0]}`
        : primary ? String(primary.slot ?? primary.key) : "1";
      if (queue.length > 0) remove(0);
      submitRef.current(choice);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, autoContinueEnabled, prompts, queue, remove, listening, processing]);

  // Re-fit window whenever content height changes (prompts load, queue grows/shrinks).
  useEffect(() => {
    if (prompts.length === 0) return;
    const t = setTimeout(() => {
      const h = Math.min(document.documentElement.scrollHeight + 2, 900);
      try {
        const right  = window.screenLeft + window.outerWidth;
        const bottom = window.screenTop  + window.outerHeight;
        window.resizeTo(520, h);
        window.moveTo(right - 520, Math.max(bottom - h, 16));
      } catch { /* blocked in non-popup windows */ }
    }, 120);
    return () => clearTimeout(t);
  }, [prompts.length, queue.length]);

  const submit = useCallback(async (choice: string) => {
    const all = promptsRef.current;
    let label = "";
    if (choice.startsWith(CUSTOM_CHOICE_PREFIX)) {
      label = choice.slice(CUSTOM_CHOICE_PREFIX.length).trim();
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

  const handleSendCustom = () => wrapSend(() => {
    if (!custom.trim()) return;
    submit(`${CUSTOM_CHOICE_PREFIX}${custom.trim()}`);
    setCustom("");
  });

  const handleEnqueue = () => wrapEnqueue(() => {
    if (!custom.trim()) return;
    enqueue(custom.trim());
    setCustom("");
  });

  const primaryPrompts = prompts.filter((p) => p.style === "primary");
  const actionPrompts = prompts.filter((p) => p.style === "action");
  const morePrompts = prompts.filter((p) => p.style === "more");

  return (
    <div className="space-y-4">
      {/* Session summary */}
      {session.sessionContent && <SessionSummary content={session.sessionContent} />}

      {/* Queue */}
      {queue.length > 0 && (
        <QueueList
          queue={queue}
          onSend={(i) => { remove(i); submit(`${CUSTOM_CHOICE_PREFIX}${queue[i]}`); }}
          onRemove={remove}
          onReorder={reorder}
          onEdit={edit}
        />
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

      {/* Action chips + More toggle — one wrapping row, no stacking */}
      {(actionPrompts.length > 0 || morePrompts.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {actionPrompts.map((p) => (
            <button
              key={p.key}
              onClick={() => submit(String(p.slot ?? p.key))}
              className={PROMPT_STYLE.action}
            >
              {p.icon} {p.label}
            </button>
          ))}
          {morePrompts.length > 0 && (
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={PROMPT_STYLE.more}
            >
              {moreOpen ? "↑ Less" : `More (${morePrompts.length})`}
            </button>
          )}
        </div>
      )}

      {/* More prompts — revealed on toggle, same chip style */}
      {moreOpen && morePrompts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {morePrompts.map((p) => (
            <button
              key={p.key}
              onClick={() => submit(String(p.slot ?? p.key))}
              className={PROMPT_STYLE.more}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Composer — single unified surface */}
      <div className="overflow-hidden rounded-2xl border border-border-default bg-surface-raised">
        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={inputRef}
            rows={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && (custom.trim() || listening)) {
                e.preventDefault();
                if (e.altKey) handleEnqueue();
                else handleSendCustom();
              }
            }}
            placeholder={
              listening ? "Recording…"
              : processing ? "Transcribing…"
              : "Custom prompt…"
            }
            className={cn(
              "w-full resize-none bg-transparent px-4 pt-3.5 pb-3 pr-11 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none",
              listening && "placeholder:text-status-negative/60",
            )}
            style={{ fieldSizing: "content", maxHeight: "8rem" } as React.CSSProperties}
          />
          {/* Mic button — top-right corner of textarea */}
          <button
            type="button"
            onClick={toggleMic}
            disabled={processing}
            title={listening ? "Stop recording" : "Voice input"}
            className={cn(
              "absolute right-2.5 top-2.5 rounded-lg p-1.5 transition-colors",
              listening
                ? "text-status-negative hover:bg-status-negative/10"
                : processing
                ? "text-text-muted opacity-40 cursor-not-allowed"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay",
            )}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : listening ? (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2}>
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Waveform strip — only while recording */}
        {listening && (
          <div className="flex items-center gap-3 px-4 pb-2">
            {waveformBars && waveformBars.length > 0 && (
              <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
                {waveformBars.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-status-negative"
                    style={{ width: 2, height: Math.max(2, Math.round(h * 12)), transition: "height 75ms ease" }}
                  />
                ))}
              </div>
            )}
            <span className="text-[11px] tabular-nums text-status-negative">
              {(() => {
                const secs = recordingSeconds ?? 0;
                const max = maxRecordingSeconds ?? 60;
                const flat = secs >= 2 && (waveformBars ?? []).every((b) => b < 0.02);
                return flat ? "No audio — speak closer" : `${secs}s / ${max}s`;
              })()}
            </span>
          </div>
        )}

        {/* Action bar — one row, vertically centred, uniform height */}
        <div className="flex items-center gap-1.5 border-t border-border-subtle px-3 py-2">
          {/* Pause / resume toggle */}
          <button
            onClick={toggleAutoContinue}
            disabled={listening || processing}
            title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
            className={cn(
              "shrink-0 rounded-md p-1 transition-colors",
              listening || processing
                ? "text-text-muted opacity-30 cursor-default"
                : !autoContinueEnabled
                ? "text-accent-text hover:bg-surface-overlay"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-overlay",
            )}
          >
            {autoContinueEnabled
              ? <Pause className="h-3.5 w-3.5" />
              : <Play className="h-3.5 w-3.5" />}
          </button>

          {/* Status — fills remaining space, truncates gracefully */}
          <span className={cn(
            "min-w-0 flex-1 truncate text-[11px]",
            micError
              ? "text-status-negative"
              : listening
              ? "text-status-negative"
              : processing
              ? "animate-pulse text-text-muted"
              : !autoContinueEnabled && !custom.trim()
              ? "text-accent-text/70"
              : "text-text-muted",
          )}>
            {micError
              ? micError
              : listening
              ? "Recording — auto-continue paused"
              : processing
              ? "Transcribing…"
              : custom.trim()
              ? "↵ send · ⌥↵ queue"
              : !autoContinueEnabled
              ? "Paused — click ▶ to resume"
              : countdown <= 0
              ? "Dispatching…"
              : queue.length > 0
              ? `"${queue[0].length > 30 ? queue[0].slice(0, 28) + "…" : queue[0]}" in ${countdown}s`
              : `AI continues in ${countdown}s`}
          </span>

          {/* Queue */}
          <button
            onClick={handleEnqueue}
            disabled={!custom.trim() && !listening}
            title={listening ? "Stop and add to queue" : "Add to queue · ⌥↵"}
            className="ui-btn-icon shrink-0 disabled:pointer-events-none disabled:opacity-25"
          >
            <ListPlus className="h-3.5 w-3.5" />
          </button>

          {/* Send */}
          <button
            onClick={handleSendCustom}
            disabled={!custom.trim() && !listening}
            title={listening ? "Stop and send" : "Send · ↵"}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              custom.trim() || listening
                ? "bg-text-primary text-text-inverted hover:opacity-90 active:opacity-80"
                : "pointer-events-none bg-surface-overlay text-text-muted opacity-40",
            )}
          >
            Send
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => window.close()}
        className="w-full py-1.5 text-center text-xs text-text-muted transition-colors hover:text-text-secondary"
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
  // 500ms poll keeps the cancel-to-close latency short enough that the 1s auto-fire grace
  // period in BeaconBody can reliably prevent a double-inject race.
  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/beacon/${id}`);
        const data = (await res.json()) as BeaconSession;
        if (data.choice !== null) window.close();
      } catch { /* network error — ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, [id, submitted]);


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
            onClick={() => window.open(`${window.location.origin}/control`, "_blank")}
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
              onClick={() => window.open(`${window.location.origin}/control`, "_blank")}
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

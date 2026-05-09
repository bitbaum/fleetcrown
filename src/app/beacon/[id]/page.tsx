"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2, Check, ArrowRight, ExternalLink,
  Pause, Play,
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useWhisperMic } from "@/hooks/use-whisper-mic";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { QueueList, PromptInput } from "@/components/control/project-card-sections";
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
  const { queue, enqueue, remove, reorder, edit } = usePromptQueue(session.project.toLowerCase());
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue } = useAutoContinue(session.project);
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
  const pendingMicActionRef = useRef<"send" | "queue" | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  // Countdown — pauses when auto-continue is off or user is composing a prompt.
  // Fires real injection at T=0 (queue first, then primary prompt).
  const isComposing = custom.trim().length > 0;
  useEffect(() => {
    if (!autoContinueEnabled || isComposing || countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinueEnabled, isComposing]);

  useEffect(() => {
    // Guard: don't fire before prompts are loaded — would close the popup with nothing injected.
    if (!autoContinueEnabled || countdown !== 0 || autoFiredRef.current || prompts.length === 0) return;
    autoFiredRef.current = true;
    const primary = prompts.find((p) => p.style === "primary");
    const choice = queue.length > 0
      ? `${CUSTOM_CHOICE_PREFIX}${queue[0]}`
      : primary ? String(primary.slot ?? primary.key) : "1";
    if (queue.length > 0) remove(0);
    submitRef.current(choice);
  }, [countdown, autoContinueEnabled, prompts, queue, remove]);

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

  const appendTranscript = useCallback((text: string) => {
    const newText = (custom ? `${custom} ${text}` : text).trim();
    setCustom(newText);
    inputRef.current?.focus();
    const pending = pendingMicActionRef.current;
    if (pending && newText) {
      pendingMicActionRef.current = null;
      if (pending === "send") submitRef.current(`${CUSTOM_CHOICE_PREFIX}${newText}`);
      else enqueue(newText);
    }
  }, [custom, enqueue]);

  const { listening, processing, error: micError, toggle: toggleMic, waveformBars, recordingSeconds, maxSeconds: maxRecordingSeconds } =
    useWhisperMic(appendTranscript);

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

  const handleSendCustom = () => {
    if (listening) {
      pendingMicActionRef.current = "send";
      toggleMic();
      return;
    }
    if (!custom.trim()) return;
    submit(`${CUSTOM_CHOICE_PREFIX}${custom.trim()}`);
    setCustom("");
  };

  const handleEnqueue = () => {
    if (listening) {
      pendingMicActionRef.current = "queue";
      toggleMic();
      return;
    }
    if (!custom.trim()) return;
    enqueue(custom.trim());
    setCustom("");
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

      {/* Status line — shows exactly what the countdown will fire */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-tertiary">
          {custom.trim()
            ? "Enter to send · Alt+Enter to queue"
            : !autoContinueEnabled
            ? "Auto-continue paused"
            : countdown <= 0
            ? "Dispatching…"
            : queue.length > 0
            ? `→ "${queue[0].length > 40 ? queue[0].slice(0, 38) + "…" : queue[0]}" in ${countdown}s${queue.length > 1 ? ` · +${queue.length - 1} more` : ""}`
            : `AI continues based on plan above in ${countdown}s`}
        </p>
        <button
          onClick={toggleAutoContinue}
          title={autoContinueEnabled ? "Pause auto-continue" : "Resume auto-continue"}
          className="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
        >
          {autoContinueEnabled
            ? <Pause className="h-3.5 w-3.5" />
            : <Play className="h-3.5 w-3.5 text-accent-text" />}
        </button>
      </div>

      {/* Custom input — shared PromptInput component, same as control panel */}
      <PromptInput
        custom={custom}
        listening={listening}
        processing={processing}
        micError={micError}
        sending={null}
        placeholder="Custom prompt…"
        showQueue
        waveformBars={waveformBars}
        recordingSeconds={recordingSeconds}
        maxRecordingSeconds={maxRecordingSeconds}
        textareaRef={inputRef}
        onCustomChange={setCustom}
        onSendCustom={handleSendCustom}
        onEnqueue={handleEnqueue}
        toggleMic={toggleMic}
      />
      {!listening && custom && (
        <div className="flex justify-end px-0.5">
          <p className="text-[11px] tabular-nums text-text-muted">{wordCount}w · {charCount}c</p>
        </div>
      )}

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

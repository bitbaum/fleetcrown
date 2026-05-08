"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, ArrowRight, Pause, Play, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useWhisperMic } from "@/hooks/use-whisper-mic";
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

function readCountdownParam(): number {
  if (typeof window === "undefined") return 30;
  const raw = new URLSearchParams(window.location.search).get("countdown");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : 30;
}

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

function Waveform({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 20 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full bg-status-negative"
          style={{ width: 3, height: Math.max(2, Math.round(h * 18)), transition: "height 75ms ease" }}
        />
      ))}
    </div>
  );
}

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function BeaconPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BeaconSession | null>(null);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [custom, setCustom] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedLabel, setSubmittedLabel] = useState("");
  const [countdown, setCountdown] = useState(readCountdownParam);
  const [paused, setPaused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

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

  const cancelCountdown = useCallback(() => {
    pausedRef.current = true;
    cancelledRef.current = true;
    setCountdown(0);
    setPaused(false);
  }, []);

  const appendTranscript = useCallback((text: string) => {
    setCustom((prev) => (prev ? `${prev} ${text}` : text).trim());
    cancelCountdown();
    inputRef.current?.focus();
  }, [cancelCountdown]);

  const { listening, processing, error: micError, toggle: toggleMic, waveformBars, recordingSeconds } = useWhisperMic(appendTranscript);

  // Pause countdown while mic is active. The ref keeps the countdown loop in sync;
  // the state drives UI only — read it in the render, not in the effect body.
  const micActive = listening || processing;
  useEffect(() => {
    if (micActive) {
      pausedRef.current = true;
    }
  }, [micActive]);
  // Merge mic-active into the displayed paused state without a cascading effect
  const displayPaused = paused || micActive;

  const submit = useCallback(async (choice: string) => {
    if (submitted) return;
    setSubmitted(true);
    const all = promptsRef.current;
    let label = "";
    if (choice.startsWith("custom:")) {
      label = choice.slice("custom:".length).trim();
    } else {
      const slot = parseInt(choice);
      const matched = all.find((p) => p.slot === slot) ?? all.find((p) => p.key === choice);
      label = matched ? `${matched.icon} ${matched.label}` : choice;
    }
    setSubmittedLabel(label);
    await fetch(`/api/beacon/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    }).catch(() => {});
    setTimeout(() => window.close(), 400);
  }, [id, submitted]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused((p) => !p);
  }, []);

  // Countdown
  useEffect(() => {
    if (!session || submitted) return;
    const primary = promptsRef.current.find((p) => p.style === "primary" && p.slot === 1);
    if (!primary) return;
    const t = setInterval(() => {
      if (pausedRef.current || cancelledRef.current) return;
      setCountdown((c) => {
        if (cancelledRef.current) return 0;
        if (inputRef.current?.value.trim()) {
          cancelledRef.current = true;
          pausedRef.current = true;
          return 0;
        }
        if (c <= 1) {
          clearInterval(t);
          submitRef.current(String(primary.slot ?? "1"));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [session?.id, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Esc close · Space pause · 1–6 direct slot pick
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === "Escape") { window.close(); return; }
      if (e.key === " ") { e.preventDefault(); togglePause(); return; }
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
  }, [togglePause]);

  const handleCustomChange = (v: string) => {
    setCustom(v);
    cancelCountdown();
  };

  const wordCount = custom.trim() ? custom.trim().split(/\s+/).length : 0;
  const charCount = custom.length;

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
              Claude is now executing this task for <span className="font-medium text-text-primary">{session?.project}</span>.
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

  const primaryPrompts = prompts.filter((p) => p.style === "primary");
  const actionPrompts = prompts.filter((p) => p.style === "action");
  const morePrompts = prompts.filter((p) => p.style === "more");

  return (
    <div className="bg-surface-page p-4 sm:p-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
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

        {/* Session summary */}
        {session.sessionContent && <SessionSummary content={session.sessionContent} />}

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
                  <span className="ml-auto shrink-0 rounded-md bg-black/20 px-2 py-0.5 font-mono text-xs tabular-nums">
                    ⚡ {countdown}s
                  </span>
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

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-text-tertiary">
            {countdown > 0
              ? displayPaused ? "Paused · Space to resume" : `Auto in ${countdown}s · Space to pause`
              : "Type to redirect · Enter to send"}
          </p>
          {countdown > 0 && (
            <button
              onClick={togglePause}
              title={displayPaused ? "Resume countdown (Space)" : "Pause countdown (Space)"}
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-default hover:text-text-secondary"
            >
              {displayPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {displayPaused ? "Resume" : "Pause"}
            </button>
          )}
        </div>

        {/* Custom input + mic */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={custom}
              onChange={(e) => handleCustomChange(e.target.value)}
              onFocus={cancelCountdown}
              onKeyDown={(e) => e.key === "Enter" && custom.trim() && submit(`custom:${custom.trim()}`)}
              placeholder={listening ? "Recording… click mic to stop" : processing ? "Transcribing…" : "Custom prompt…"}
              className={`ui-input flex-1 ${listening ? "border-status-negative/40" : processing ? "border-accent-primary/30" : ""}`}
            />

            {/* Mic button */}
            <button
              onClick={toggleMic}
              disabled={processing}
              title={listening ? "Stop recording" : "Speak a prompt"}
              className={`flex items-center justify-center rounded-xl border px-3 transition-colors ${
                listening
                  ? "animate-pulse border-status-negative/40 bg-status-negative/10 text-status-negative"
                  : processing
                  ? "border-border-subtle bg-surface-base text-text-muted opacity-60"
                  : "border-border-subtle bg-surface-base text-text-muted hover:border-border-default hover:text-text-secondary"
              }`}
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              {!processing && (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2}>
                  {listening
                    ? <rect x="6" y="6" width="12" height="12" rx="2" />
                    : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>}
                </svg>
              )}
            </button>

            <button
              onClick={() => custom.trim() && submit(`custom:${custom.trim()}`)}
              disabled={!custom.trim()}
              className="ui-btn-primary px-4 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Status row below input */}
          <div className="flex items-center justify-between px-0.5">
            <div className="min-h-[16px] flex items-center">
              {micError && (
                <p className="text-[11px] text-status-negative">{micError}</p>
              )}
              {listening && !micError && (() => {
                const flat = recordingSeconds >= 2 && waveformBars.every((b) => b < 0.02);
                return flat ? (
                  <p className="text-[11px] text-status-warning">No audio — speak closer or raise mic volume</p>
                ) : (
                  <p className="text-[11px] text-status-negative">
                    Recording · {formatRecordingTime(recordingSeconds)}
                  </p>
                );
              })()}
              {processing && !micError && (
                <p className="text-[11px] text-text-tertiary animate-pulse">Processing…</p>
              )}
            </div>
            {listening && !micError ? (
              <Waveform bars={waveformBars} />
            ) : custom ? (
              <p className="text-[11px] tabular-nums text-text-muted">
                {wordCount}w · {charCount}c
              </p>
            ) : null}
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => window.close()}
          className="w-full py-2 text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Dismiss · Esc
        </button>
      </div>
    </div>
  );
}

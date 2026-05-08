"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, ArrowRight, Pause, Play, Mic, MicOff, ExternalLink } from "lucide-react";

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

// Pulsing ring shown when mic is active
function MicPulse() {
  return (
    <span className="relative flex h-4 w-4">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-negative opacity-50" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full">
        <MicOff className="h-4 w-4 text-status-negative" />
      </span>
    </span>
  );
}

export default function BeaconPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BeaconSession | null>(null);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [custom, setCustom] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [paused, setPaused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [micError, setMicError] = useState("");
  const [interimText, setInterimText] = useState(""); // live interim transcript
  const inputRef = useRef<HTMLInputElement>(null);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const recRef = useRef<{ abort(): void; stop(): void } | null>(null);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  useEffect(() => {
    fetch(`/api/beacon/${id}`).then((r) => r.json()).then(setSession).catch(() => {});
    fetch("/api/prompts/agent").then((r) => r.json()).then(setPrompts).catch(() => {});
  }, [id]);

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

  const submit = useCallback(async (choice: string) => {
    if (submitted) return;
    setSubmitted(true);
    recRef.current?.abort();
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

  const cancelCountdown = useCallback(() => {
    pausedRef.current = true;
    cancelledRef.current = true;
    setCountdown(0);
    setPaused(false);
  }, []);

  // Mic via Web Speech API — interimResults for live preview
  const toggleMic = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      setInterimText("");
      return;
    }

    type SRResult = { transcript: string; isFinal: boolean };
    type SRResultList = ArrayLike<ArrayLike<SRResult>> & { isFinal: boolean; resultIndex?: number };
    type SREvent = { results: SRResultList; resultIndex: number };
    type SRError = { error: string };
    type SRCtor = new () => {
      start(): void; abort(): void; stop(): void;
      lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
      onresult: ((e: SREvent) => void) | null;
      onerror: ((e: SRError) => void) | null;
      onend: (() => void) | null;
    };

    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SRCtor | undefined;
    if (!SR) {
      setMicUnavailable(true);
      setMicError("Speech recognition not available in this browser");
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;   // show live text as you speak
    rec.continuous = false;       // stop after natural pause
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < (e.results as unknown as SRResult[][]).length; i++) {
        const res = (e.results as unknown as SRResultList)[i];
        const transcript = (res[0] as SRResult).transcript;
        if ((res as unknown as { isFinal: boolean }).isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalText) {
        setCustom((prev) => (prev ? `${prev} ${finalText}` : finalText).trim());
        setInterimText("");
        cancelCountdown();
        inputRef.current?.focus();
      } else {
        setInterimText(interim);
      }
    };

    rec.onerror = (e) => {
      setListening(false);
      setInterimText("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicUnavailable(true);
        setMicError("Mic permission denied — allow in browser settings");
      } else if (e.error === "network") {
        setMicError("Network error — speech API needs internet access");
      } else if (e.error === "no-speech") {
        setMicError("No speech detected — try again");
      } else if (e.error === "aborted") {
        // user stopped, not an error
        setMicError("");
      } else {
        setMicError(`Mic error: ${e.error}`);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterimText("");
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setMicError("");
      pausedRef.current = true;
      setPaused(true);
    } catch (err) {
      setListening(false);
      setMicError(`Could not start mic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [listening, cancelCountdown]);

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
      <div className="flex h-48 flex-col items-center justify-center gap-3 bg-surface-page">
        <Check className="h-8 w-8 text-status-positive" />
        <p className="text-sm text-text-secondary">Running…</p>
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
          <p className="text-[11px] text-text-muted">
            {countdown > 0
              ? paused ? "Paused · Space to resume" : `Auto in ${countdown}s · Space to pause`
              : "Type to redirect · Enter to send"}
          </p>
          {countdown > 0 && (
            <button
              onClick={togglePause}
              title={paused ? "Resume countdown (Space)" : "Pause countdown (Space)"}
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-default hover:text-text-secondary"
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>

        {/* Custom input + mic */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={custom}
                onChange={(e) => handleCustomChange(e.target.value)}
                onFocus={cancelCountdown}
                onKeyDown={(e) => e.key === "Enter" && custom.trim() && submit(`custom:${custom.trim()}`)}
                placeholder={listening ? (interimText || "Listening…") : "Custom prompt…"}
                className={`ui-input w-full ${listening && !custom ? "placeholder:text-status-negative/60 placeholder:italic" : ""}`}
              />
              {/* Live interim transcript overlay */}
              {listening && interimText && (
                <div className="pointer-events-none absolute inset-0 flex items-center px-3">
                  <span className="truncate text-sm italic text-text-tertiary">{interimText}</span>
                </div>
              )}
            </div>

            {/* Mic button */}
            {!micUnavailable && (
              <button
                onClick={toggleMic}
                title={listening ? "Stop recording" : "Speak a prompt"}
                className={`flex items-center justify-center rounded-xl border px-3 transition-colors ${
                  listening
                    ? "border-status-negative/40 bg-status-negative/10 text-status-negative"
                    : "border-border-subtle bg-surface-base text-text-muted hover:border-border-default hover:text-text-secondary"
                }`}
              >
                {listening ? <MicPulse /> : <Mic className="h-4 w-4" />}
              </button>
            )}

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
            <div className="min-h-[16px]">
              {micError && (
                <p className="text-[11px] text-status-negative">{micError}</p>
              )}
              {listening && !micError && (
                <p className="text-[11px] text-status-negative animate-pulse">Recording…</p>
              )}
            </div>
            {custom && (
              <p className="text-[11px] tabular-nums text-text-muted">
                {wordCount}w · {charCount}c
              </p>
            )}
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

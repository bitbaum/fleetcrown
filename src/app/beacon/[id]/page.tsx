"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, ArrowRight, Pause, Play, Mic, Square, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

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

type MicState = "idle" | "recording" | "processing";

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

function readCountdownParam(): number {
  if (typeof window === "undefined") return 30;
  const raw = new URLSearchParams(window.location.search).get("countdown");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : 30;
}

export default function BeaconPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BeaconSession | null>(null);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [custom, setCustom] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(readCountdownParam);
  const [paused, setPaused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [micError, setMicError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(16).fill(0));
  const inputRef = useRef<HTMLInputElement>(null);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => void>(() => {});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const stopMicCleanup = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (autoStopTimerRef.current !== null) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWaveformBars(Array(16).fill(0));
    setRecordingSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopMicCleanup();
    };
  }, [stopMicCleanup]);

  const submit = useCallback(async (choice: string) => {
    if (submitted) return;
    setSubmitted(true);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopMicCleanup();
    await fetch(`/api/beacon/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    }).catch(() => {});
    setTimeout(() => window.close(), 400);
  }, [id, submitted, stopMicCleanup]);

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

  const startWaveformAnimation = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const barCount = 16;
      const step = Math.floor(dataArray.length / barCount);
      const bars = Array.from({ length: barCount }, (_, i) => {
        const slice = dataArray.slice(i * step, (i + 1) * step);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        return avg / 255;
      });
      setWaveformBars(bars);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const toggleMic = useCallback(async () => {
    if (micState === "recording") {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (micState === "processing") return;

    setMicError("");
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMicError(`Mic access denied: ${msg}`);
      return;
    }

    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopMicCleanup();
      setMicState("processing");

      const actualMime = mediaRecorderRef.current?.mimeType ?? "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: actualMime });
      audioChunksRef.current = [];

      if (blob.size < 100) {
        setMicState("idle");
        setMicError("Recording too short — hold mic button while speaking");
        return;
      }

      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      try {
        const res = await fetch("/api/beacon/transcribe", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) {
          setMicError(data.error ?? "No speech detected");
        } else {
          setCustom((prev) => (prev ? `${prev} ${data.text}` : data.text!).trim());
          cancelCountdown();
          inputRef.current?.focus();
        }
      } catch (err) {
        setMicError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setMicState("idle");
      }
    };

    recorder.start(100);
    setMicState("recording");
    setRecordingSeconds(0);
    pausedRef.current = true;
    setPaused(true);

    startWaveformAnimation();

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);

    autoStopTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }, 60_000);
  }, [micState, cancelCountdown, stopMicCleanup, startWaveformAnimation]);

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
            <input
              ref={inputRef}
              value={custom}
              onChange={(e) => handleCustomChange(e.target.value)}
              onFocus={cancelCountdown}
              onKeyDown={(e) => e.key === "Enter" && custom.trim() && submit(`custom:${custom.trim()}`)}
              placeholder="Custom prompt…"
              className="ui-input flex-1"
            />

            {/* Mic button */}
            <button
              onClick={toggleMic}
              disabled={micState === "processing"}
              title={micState === "recording" ? "Stop recording" : "Speak a prompt"}
              className={`flex items-center justify-center rounded-xl border px-3 transition-colors ${
                micState === "recording"
                  ? "animate-pulse border-status-negative/40 bg-status-negative/10 text-status-negative"
                  : micState === "processing"
                  ? "border-border-subtle bg-surface-base text-text-muted opacity-60"
                  : "border-border-subtle bg-surface-base text-text-muted hover:border-border-default hover:text-text-secondary"
              }`}
            >
              {micState === "recording" && <Square className="h-4 w-4" />}
              {micState === "processing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {micState === "idle" && <Mic className="h-4 w-4" />}
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
              {micState === "recording" && !micError && (
                <p className="text-[11px] text-status-negative">
                  Recording · {formatRecordingTime(recordingSeconds)}
                </p>
              )}
              {micState === "processing" && !micError && (
                <p className="text-[11px] text-text-tertiary animate-pulse">Processing…</p>
              )}
            </div>
            {micState === "recording" && !micError ? (
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

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, Check, ExternalLink, Repeat2,
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useMicComposer } from "@/hooks/use-mic-composer";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { PromptInput } from "@/components/control/prompt-input";
import { QueueList } from "@/components/control/queue-list";
import { ProjectPromptLibrary } from "@/components/control/ProjectPromptLibrary";
import { buildSessionHandoffFromBeaconSession, SessionHandoff } from "@/components/control/SessionHandoff";
import { getJson, patchJson } from "@/lib/api/fetch";
import { PROMPT_STYLE } from "@/lib/constants/control";
import { parseSessionText } from "@/lib/session-content";
import { DEFAULT_BEACON_COUNTDOWN_S, MIN_BEACON_COUNTDOWN_S, MAX_BEACON_COUNTDOWN_S, CUSTOM_CHOICE_PREFIX, SWITCH_CHOICE_PREFIX, AUTO_INJECT_S } from "@/lib/constants/control";
import { readyAtKey, beaconComposingKey } from "@/lib/control-storage";
import { getAdapterLabel } from "@/config/control-intents";
import type { BeaconSession } from "@/app/api/beacon/route";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";

function agentLabel(agent: string | null | undefined): string {
  return agent ? getAdapterLabel(agent) : "agent";
}

function SessionSummary({ content }: { content: string }) {
  if (!content.trim()) return null;
  return (
    <SessionHandoff
      data={buildSessionHandoffFromBeaconSession(parseSessionText(content))}
      surface="panel"
      microLabels
    />
  );
}

function readCountdownParam(): number {
  if (typeof window === "undefined") return DEFAULT_BEACON_COUNTDOWN_S;
  const raw = new URLSearchParams(window.location.search).get("countdown");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= MIN_BEACON_COUNTDOWN_S && n <= MAX_BEACON_COUNTDOWN_S ? n : DEFAULT_BEACON_COUNTDOWN_S;
}

// ─── BeaconBody ─────────────────────────────────────────────────────────────

function BeaconBody({
  session,
  prompts,
  onSubmitted,
  onClose,
}: {
  session: BeaconSession;
  prompts: AgentPrompt[];
  onSubmitted: (label: string) => void;
  onClose?: () => void;
}) {
  const { queue, enqueue, remove, reorder, edit } = usePromptQueue(session.project);
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue, enable: enableAutoContinue } = useAutoContinue(session.project);
  useEffect(() => { enableAutoContinue(); }, [enableAutoContinue]);
  const [custom, setCustom] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [countdown, setCountdown] = useState(() => {
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

  const { listening, processing, micError, toggleMic, waveformBars, recordingSeconds, maxRecordingSeconds, wrapSend, wrapEnqueue } = useMicComposer({
    custom,
    onAppend: (newText) => { setCustom(newText); inputRef.current?.focus(); },
    onSendAfterRecording: (text) => submitRef.current(`${CUSTOM_CHOICE_PREFIX}${text}`),
    onEnqueueAfterRecording: enqueue,
  });

  const isComposing = custom.trim().length > 0 || inputFocused || listening || processing;

  useEffect(() => {
    try {
      if (isComposing) {
        localStorage.setItem(beaconComposingKey(session.project), "1");
      } else {
        localStorage.removeItem(beaconComposingKey(session.project));
      }
    } catch {}
    return () => {
      try { localStorage.removeItem(beaconComposingKey(session.project)); } catch {}
    };
  }, [isComposing, session.project]);

  useEffect(() => {
    if (!autoContinueEnabled || isComposing || countdown <= 0 || prompts.length === 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinueEnabled, isComposing, prompts.length]);

  useEffect(() => {
    if (!autoContinueEnabled || countdown !== 0 || autoFiredRef.current || prompts.length === 0 || isComposing) return;
    const t = setTimeout(() => {
      if (autoFiredRef.current) return;
      autoFiredRef.current = true;
      const primary = prompts.find((p) => p.style === "primary");
      const choice = session.capacityIssue && session.nextAgent
        ? `${SWITCH_CHOICE_PREFIX}${session.nextAgent}`
        : queue.length > 0
        ? `${CUSTOM_CHOICE_PREFIX}${queue[0]}`
        : primary ? String(primary.slot ?? primary.key) : "1";
      if (!session.capacityIssue && queue.length > 0) remove(0);
      submitRef.current(choice);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, autoContinueEnabled, prompts, queue, remove, isComposing, session.capacityIssue, session.nextAgent]);

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
    } else if (choice.startsWith(SWITCH_CHOICE_PREFIX)) {
      label = `Switch to ${agentLabel(choice.slice(SWITCH_CHOICE_PREFIX.length))}`;
    } else {
      const slot = parseInt(choice);
      const matched = all.find((p) => p.slot === slot) ?? all.find((p) => p.key === choice);
      label = matched ? `${matched.icon} ${matched.label}` : choice;
    }
    onSubmitted(label);
    await patchJson(`/api/beacon/${session.id}`, { choice }).catch(() => {});
    setTimeout(() => (onClose ? onClose() : window.close()), 400);
  }, [session.id, onSubmitted, onClose]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

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
      {session.sessionContent && <SessionSummary content={session.sessionContent} />}

      {queue.length > 0 && (
        <QueueList
          queue={queue}
          onSend={(i) => { remove(i); submit(`${CUSTOM_CHOICE_PREFIX}${queue[i]}`); }}
          onRemove={remove}
          onReorder={reorder}
          onEdit={edit}
        />
      )}

      {session.nextAgent && (
        <div className={session.capacityIssue ? "ui-panel rounded-xl border-status-warning/40 p-3" : "ui-panel rounded-xl p-3"}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={session.capacityIssue ? "ui-tag ui-tag-warning" : "ui-tag ui-tag-neutral"}>
              {session.capacityIssue ? "capacity issue" : "fallback ready"}
            </span>
            <span className="text-sm text-text-secondary">
              {agentLabel(session.currentAgent)} → {agentLabel(session.nextAgent)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => submit(`${SWITCH_CHOICE_PREFIX}${session.nextAgent}`)}
            className="ui-btn-secondary mt-3 w-full justify-start gap-2"
          >
            <Repeat2 className="h-4 w-4" />
            Switch to {agentLabel(session.nextAgent)} and continue
            {session.capacityIssue && autoContinueEnabled && countdown > 0 && (
              <span className="ml-auto font-mono text-xs tabular-nums">{countdown}s</span>
            )}
          </button>
        </div>
      )}

      {primaryPrompts.length > 0 && (
        <div className="space-y-2">
          {primaryPrompts.map((p) => (
            <button
              key={p.key}
              onClick={() => submit(String(p.slot ?? p.key))}
              className="ui-btn-ready-primary w-full justify-start gap-3 px-4 py-3 text-left text-sm"
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

      <PromptInput
        custom={custom}
        listening={listening}
        processing={processing}
        micError={micError}
        sending={null}
        placeholder="Custom prompt..."
        showQueue
        waveformBars={waveformBars}
        recordingSeconds={recordingSeconds}
        maxRecordingSeconds={maxRecordingSeconds}
        autoContinueEnabled={autoContinueEnabled}
        statusLabel={
          micError
            ? micError
            : listening
            ? "Recording - paused"
            : processing
            ? "Transcribing..."
            : custom.trim()
            ? "Enter sends - Alt+Enter queues"
            : inputFocused
            ? "Focused - paused"
            : !autoContinueEnabled
            ? "Paused - click play to resume"
            : countdown <= 0
            ? "Dispatching..."
            : session.capacityIssue && session.nextAgent
            ? `Switching to ${agentLabel(session.nextAgent)} in ${countdown}s`
            : queue.length > 0
            ? `"${queue[0].length > 30 ? queue[0].slice(0, 28) + "..." : queue[0]}" in ${countdown}s`
            : `AI continues in ${countdown}s`
        }
        textareaRef={inputRef}
        onCustomChange={setCustom}
        onCustomFocusChange={setInputFocused}
        onSendCustom={handleSendCustom}
        onEnqueue={handleEnqueue}
        onToggleAutoContinue={toggleAutoContinue}
        toggleMic={toggleMic}
      />

      <ProjectPromptLibrary
        projectName={session.project}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={(prompt) => submit(`${CUSTOM_CHOICE_PREFIX}${prompt}`)}
        compact
      />

      <button
        onClick={() => window.close()}
        className="ui-btn-ghost w-full text-xs text-text-muted"
      >
        Dismiss · Esc
      </button>
    </div>
  );
}

// ─── BeaconPageClient ────────────────────────────────────────────────────────
// Receives initialSession from the server component. Prompts are still fetched
// client-side (they require auth); if the fetch fails they remain empty and
// auto-continue is disabled until prompts load.

export function BeaconPageClient({
  initialSession,
  onClose,
}: {
  initialSession: BeaconSession;
  onClose?: () => void;
}) {
  const [session] = useState<BeaconSession>(initialSession);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedLabel, setSubmittedLabel] = useState("");

  useEffect(() => {
    getJson<AgentPrompt[]>("/api/prompts/agent").then(setPrompts).catch(() => {});
  }, []);

  // Poll every 500ms to close/reset if another client already injected a choice.
  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(async () => {
      try {
        const data = await getJson<BeaconSession>(`/api/beacon/${session.id}`);
        if (data.choice !== null) { if (onClose) { onClose(); } else { window.close(); } }
      } catch { /* network error or 401 — ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, [session.id, submitted, onClose]);

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-base p-4 sm:p-5">
        <div className="ui-card-header mb-0">
          <div className="ui-card-header-main flex items-center gap-2.5">
            <span className="block h-2.5 w-2.5 shrink-0 rounded-full border border-status-positive bg-status-positive" />
            <span className="text-sm font-semibold text-text-primary">{session.project}</span>
            <span className="ui-tag ui-tag-positive">dispatched</span>
          </div>
          <div className="ui-card-actions">
            <button
              onClick={() => window.open(`${window.location.origin}/control`, "_blank")}
              className="ui-icon-action"
              title="Open Control panel"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-border-subtle pt-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-positive/15">
              <Check className="h-4 w-4 text-status-positive" />
            </div>
            <p className="text-sm font-medium text-text-primary">{submittedLabel || "Agent running…"}</p>
          </div>
          <p className="text-xs text-text-tertiary">
            Watch progress in the Control panel — this window will close shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base p-4 sm:p-5">
      <div className="ui-card-header">
        <div className="ui-card-header-main flex items-center gap-2.5">
          <span className="block h-2.5 w-2.5 shrink-0 rounded-full border border-status-positive bg-status-positive" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-text-primary">{session.project}</span>
              <span className="ui-tag ui-tag-positive">done</span>
            </div>
            <p className="ui-micro-label mt-0.5">session complete</p>
          </div>
        </div>
        <div className="ui-card-actions">
          <ThemeToggle compact />
          <button
            onClick={() => window.open(`${window.location.origin}/control`, "_blank")}
            className="ui-icon-action"
            title="Open Control panel"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-4">
        <BeaconBody
          session={session}
          prompts={prompts}
          onSubmitted={(label) => { setSubmitted(true); setSubmittedLabel(label); }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

// Loading state used while the server reads the session.
export function BeaconLoading() {
  return (
    <div className="flex h-64 items-center justify-center bg-surface-base">
      <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
    </div>
  );
}

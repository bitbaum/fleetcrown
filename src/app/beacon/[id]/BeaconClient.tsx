"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, Check, ExternalLink, Repeat2, GitBranch,
} from "lucide-react";
import { useMicComposer } from "@/hooks/use-mic-composer";
import { usePromptQueue } from "@/hooks/use-prompt-queue";
import { useAutoContinue } from "@/hooks/use-auto-continue";
import { useAutomationPolicy } from "@/hooks/use-automation-policy";
import { PromptInput } from "@/components/control/prompt-input";
import { QueueList } from "@/components/control/queue-list";
import { ProjectPromptLibrary } from "@/components/control/ProjectPromptLibrary";
import { ReadyBanner } from "@/components/control/ready-banner";
import { buildSessionHandoffFromBeaconSession, SessionHandoff } from "@/components/control/SessionHandoff";
import { getJson, patchJson } from "@/lib/api/fetch";
import { PROMPT_STYLE, CUSTOM_CHOICE_PREFIX, SWITCH_CHOICE_PREFIX } from "@/lib/constants/control";
import { parseSessionText } from "@/lib/session-content";
import { beaconComposingKey } from "@/lib/control-storage";
import { getAdapterLabel } from "@/config/control-intents";
import type { BeaconSession } from "@/app/api/beacon/route";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";
import type { RecentCustomPrompt } from "@/db/queries/prompt-history";

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
  const { enabled: autoContinueEnabled, toggle: toggleAutoContinue } = useAutoContinue(session.project);
  const { mode: automationMode } = useAutomationPolicy();
  const [custom, setCustom] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [recentPrompts, setRecentPrompts] = useState<RecentCustomPrompt[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptsRef = useRef<AgentPrompt[]>([]);
  const submitRef = useRef<(choice: string) => Promise<boolean>>(async () => false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  const { listening, processing, micError, toggleMic, waveformBars, recordingSeconds, maxRecordingSeconds, wrapSend, wrapEnqueue } = useMicComposer({
    custom,
    onAppend: (newText) => { setCustom(newText); inputRef.current?.focus(); },
    onSendAfterRecording: (text) => submitRef.current(`${CUSTOM_CHOICE_PREFIX}${text}`),
    onEnqueueAfterRecording: enqueue,
  });

  const isComposing = custom.trim().length > 0 || inputFocused || listening || processing;

  // Mirror composing state to localStorage so ReadyBanner's auto-fire respects it cross-window.
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
    getJson<RecentCustomPrompt[]>(`/api/beacon/recent?project=${encodeURIComponent(session.project)}`)
      .then(setRecentPrompts)
      .catch(() => {});
  }, [session.project]);

  // Resize the popup window to fit content after layout settles.
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
  }, [prompts.length, queue.length, recentPrompts.length]);

  const dismiss = useCallback(() => { if (onClose) onClose(); else window.close(); }, [onClose]);

  const submit = useCallback(async (choice: string): Promise<boolean> => {
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
    setSubmitError(null);
    try {
      const response = await patchJson(`/api/beacon/${session.id}`, { choice });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onSubmitted(label);
      setTimeout(() => dismiss(), 400);
      return true;
    } catch {
      setSubmitError("Could not send your instruction. It is still available to retry.");
      return false;
    }
  }, [session.id, onSubmitted, dismiss]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === "Escape") { dismiss(); return; }
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
  }, [dismiss]);

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

  // Auto-fire logic: picks the right choice based on queue / capacity issue state.
  // Called by ReadyBanner when the countdown reaches zero (and auto-continue is on).
  //
  // Agent-driven gate: handoff.status must say "ready" before any auto-fire
  // happens. Anything else (empty, "working", any other value) suppresses.
  // Model-agnostic — any adapter that writes the standard handoff fields
  // gets the same gating. Capacity-issue (agent quota hit) bypasses since
  // that's a recovery dispatch the user explicitly asked for.
  const automaticContinuationEnabled = autoContinueEnabled && (
    automationMode === "strategist" ||
    automationMode === "next_best" ||
    (automationMode === "queue_only" && queue.length > 0)
  );
  const queuePolicyWaiting = automationMode === "queue_only" && autoContinueEnabled && queue.length === 0;

  const handleAutoInject = useCallback(async () => {
    if (!automaticContinuationEnabled) return;
    // BeaconSession carries raw sessionContent — parse it here to extract
    // the handoff status. Capacity-issue dispatches bypass since the user
    // explicitly asked for the agent switch.
    const status = (parseSessionText(session.sessionContent).status ?? "").toLowerCase();
    if (status !== "ready" && !session.capacityIssue) return;
    const all = promptsRef.current;
    const primary = all.find((p) => p.style === "primary");
    const choice = session.capacityIssue && session.nextAgent
      ? `${SWITCH_CHOICE_PREFIX}${session.nextAgent}`
      : queue.length > 0
      ? `${CUSTOM_CHOICE_PREFIX}${queue[0]}`
      : primary ? (primary.slot != null ? String(primary.slot) : primary.key) : "1";
    if (await submitRef.current(choice) && !session.capacityIssue && queue.length > 0) remove(0);
  }, [automaticContinuationEnabled, session.sessionContent, session.capacityIssue, session.nextAgent, queue, remove]);

  const morePrompts = prompts.filter((p) => p.style === "more");

  const statusLabel = micError
    ? micError
    : listening
    ? "Recording - paused"
    : processing
    ? "Transcribing..."
    : custom.trim()
    ? "Enter sends · Alt+Enter queues"
    : inputFocused
    ? "Focused - paused"
    : automationMode === "off"
    ? "Manual mode - waiting for your instruction"
    : !autoContinueEnabled
    ? "Automatic continuation paused for this project"
    : queuePolicyWaiting
    ? "Continue queued work - add an instruction to the queue"
    : session.capacityIssue && session.nextAgent
    ? `Switching to ${agentLabel(session.nextAgent)}`
    : queue.length > 0
    ? `"${queue[0].length > 30 ? queue[0].slice(0, 28) + "…" : queue[0]}" queued`
    : "Auto-continue ready";

  return (
    <div className="space-y-4">
      {session.sessionContent && <SessionSummary content={session.sessionContent} />}

      {queue.length > 0 && (
        <QueueList
          queue={queue}
          onSend={async (i) => { if (await submit(`${CUSTOM_CHOICE_PREFIX}${queue[i]}`)) remove(i); }}
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
          </button>
        </div>
      )}

      {submitError && <p className="ui-box-error text-sm">{submitError}</p>}

      {/* ReadyBanner is the SSOT for the countdown, auto-continue toggle, and primary/action buttons. */}
      {prompts.length > 0 && (
        <ReadyBanner
          tab={session.project}
          prompts={prompts}
          onSend={(key) => submit(key)}
          onDismiss={dismiss}
          onAutoInject={handleAutoInject}
          autoContinueEnabled={automaticContinuationEnabled}
          onToggleAutoContinue={automationMode === "off" || queuePolicyWaiting ? undefined : toggleAutoContinue}
          paused={isComposing}
          nextQueueItem={queue.length > 0 ? queue[0] : undefined}
          queueTotal={queue.length}
          title="Agent ready"
          inactiveLabel={queuePolicyWaiting ? "Queue empty" : undefined}
        />
      )}

      {morePrompts.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5">
          {morePrompts.map((p) => (
            <button key={p.key} onClick={() => submit(String(p.slot ?? p.key))} className={PROMPT_STYLE.more}>
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
        placeholder="Custom prompt…"
        showQueue
        waveformBars={waveformBars}
        recordingSeconds={recordingSeconds}
        maxRecordingSeconds={maxRecordingSeconds}
        autoContinueEnabled={automationMode === "off" ? false : autoContinueEnabled}
        statusLabel={statusLabel}
        textareaRef={inputRef}
        onCustomChange={setCustom}
        onCustomFocusChange={setInputFocused}
        onSendCustom={handleSendCustom}
        onEnqueue={handleEnqueue}
        onToggleAutoContinue={automationMode === "off" ? undefined : toggleAutoContinue}
        toggleMic={toggleMic}
      />

      {recentPrompts.length > 0 && (
        <div className="space-y-1.5 px-5">
          <p className="ui-kicker">Reuse recent prompts</p>
          <div className="flex flex-wrap gap-1.5">
            {recentPrompts.map((r) => (
              <button
                key={r.customPrompt}
                onClick={() => setCustom(r.customPrompt)}
                title={r.customPrompt}
                className="ui-chip-truncate-label"
              >
                {r.count > 1 && <span className="mr-1.5">used {r.count}×</span>}
                {r.customPrompt.length > 60 ? r.customPrompt.slice(0, 60) + "…" : r.customPrompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <ProjectPromptLibrary
        projectName={session.project}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={(prompt) => submit(`${CUSTOM_CHOICE_PREFIX}${prompt}`)}
        compact
      />
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
  const session = initialSession;
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
        <div className="ui-card-header-main">
          <div className="flex items-center gap-2.5">
            <span className="block h-2.5 w-2.5 shrink-0 rounded-full border border-status-positive bg-status-positive" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-semibold text-text-primary">{session.project}</span>
              <span className="ui-tag ui-tag-positive">Ready</span>
            </div>
          </div>
          <div className="ui-control-card-header-meta mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-text-tertiary">
              {getAdapterLabel(session.currentAgent ?? "claude")} ready
            </span>
            {session.gitBranch && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-text-tertiary">
                <GitBranch className="h-3 w-3 shrink-0" />
                {session.gitBranch}
              </span>
            )}
          </div>
        </div>
        <div className="ui-card-actions shrink-0 self-start">
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

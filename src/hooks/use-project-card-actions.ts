"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { postJson } from "@/lib/api/fetch";
import type { ProjectState } from "@/lib/control-types";
import type { PromptMeta } from "@/lib/agent-config";
import type { OrchestrationTaskIntentId } from "@/lib/orchestration";
import { mapClaudePromptToIntent } from "@/lib/orchestration";
import type { DispatchResult } from "@/app/api/control/dispatch/route";
import { clearDraft, getDraft, setDraft } from "@/lib/draft-storage";
import { FEEDBACK_MEDIUM_MS } from "@/lib/constants/timings";

export function useProjectCardActions({
  project,
  queue,
  removeFromQueue,
  clearQueue,
  onInject,
  onRunWithBrain,
  setDismissed,
  isReadyNow,
  prompts,
  isOnlyReady,
  autoContinueEnabled,
}: {
  project: ProjectState;
  queue: string[];
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  onInject: (tab: string, promptKey?: string, customPrompt?: string) => Promise<void>;
  onRunWithBrain: (project: ProjectState, intent: OrchestrationTaskIntentId) => Promise<void>;
  setDismissed: (v: boolean) => void;
  isReadyNow: boolean;
  prompts: PromptMeta[];
  isOnlyReady: boolean;
  autoContinueEnabled: boolean;
}) {
  const [sending, setSending] = useState<string | null>(null);
  // Transient "✓ Dispatched" confirmation per action — set on confirmed-
  // successful inject/orchestration call, auto-cleared after FEEDBACK_MS.
  // The user reported (UX audit) that Send / Test & fix / Quality / Commit /
  // Next best return 200 silently — textarea clears, button reverts, no
  // confirmation. This mirrors the proven "Tab switched ✓" pattern from
  // ProjectStatusChips → focusWorkspace. Stores both id (so each button
  // confirms only itself) and the timestamp (so React rerenders fire at
  // the right time).
  const [justSent, setJustSent] = useState<{ id: string; at: number } | null>(null);
  const justSentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSent = useCallback((id: string) => {
    setJustSent({ id, at: Date.now() });
    if (justSentTimer.current) clearTimeout(justSentTimer.current);
    justSentTimer.current = setTimeout(() => setJustSent(null), FEEDBACK_MEDIUM_MS);
  }, []);
  useEffect(() => () => { if (justSentTimer.current) clearTimeout(justSentTimer.current); }, []);
  // Lazy-init from localStorage draft so a failed send / page reload / tab
  // close doesn't drop the user's typed prompt. clearDraft is called only on
  // confirmed-successful sendCustom / sendText. See incident 2026-05-20:
  // mobile user sent from phone, request errored, draft lost.
  const [custom, _setCustom] = useState<string>(() => getDraft(project.tab));
  const setCustom = useCallback((next: string) => {
    _setCustom(next);
    setDraft(project.tab, next);
  }, [project.tab]);
  const [customFocused, setCustomFocused] = useState(false);
  const [merging, setMerging] = useState(false);
  const [preloadedDispatch, setPreloadedDispatch] = useState<DispatchResult | null>(null);
  // sendError surfaces dispatch failures inline near the send button — the
  // global ControlPanel error renders above the project cards and is invisible
  // on mobile when the user is scrolled down to a specific card. Inline error
  // means a failed send is impossible to miss.
  const [sendError, setSendError] = useState<string | null>(null);
  const clearSendError = useCallback(() => setSendError(null), []);

  // Pre-fetch dispatch decision as soon as the ready banner appears.
  // Note 2026-05-20: previously gated on queue.length > 0, which short-
  // circuited the strategist for the most-valuable case (empty queue,
  // smart-nudge needed). Now fires whenever ready — server decides what
  // to do based on auto_inject_mode + queue + handoff.
  useEffect(() => {
    if (!isReadyNow) {
      setPreloadedDispatch(null);
      return;
    }
    const handoff = {
      done:   project.session?.done   ?? "",
      next:   project.session?.next   ?? "",
      health: project.session?.health ?? "",
      tests:  project.session?.tests  ?? "",
      todos:  project.session?.todos  ?? "",
      status: project.session?.status ?? "",
    };
    let cancelled = false;
    postJson("/api/control/dispatch", {
      handoff,
      blockerCount:  0,
      noOpCount:     project.session?.noOpCount ?? 0,
      queue,
      projectName:   project.tab,
      projectKey:    project.tab,
      gitBranch:     project.git?.branch,
      recentCommits: project.git?.recentCommits,
      mission:       project.profile?.mission,
    }).then(async (res) => {
      if (!cancelled && res.ok) setPreloadedDispatch(await res.json() as DispatchResult);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyNow, queue.length]);

  const sessionHealthBlocksQueue = (): boolean => {
    const health = (project.session?.health ?? "").toLowerCase();
    const tests  = (project.session?.tests  ?? "").toLowerCase();
    return health.includes("critical") || tests.includes("fail");
  };

  const sendCustom = async () => {
    if (!custom.trim()) return;
    const trimmed = custom.trim();
    setSending("custom");
    setSendError(null);
    setDismissed(true);
    try {
      // Mirror the smartEnqueue special case: if the user is deliberately sending
      // a handoff-controlled prompt (the exact workflow they use to drive the agent
      // from the UI), prefer direct execution over queueing.
      await onInject(project.tab, undefined, trimmed);
      setCustom("");
      markSent("custom");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  };

  const sendText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSending("custom");
    setSendError(null);
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, text.trim());
      // Belt-and-suspenders: sendText bypasses setCustom (the draft auto-clear
      // path), so explicit clearDraft after successful send.
      clearDraft(project.tab);
      markSent("custom");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  }, [project.tab, onInject, setDismissed, markSent]);

  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
    if (intent === "next_best" && !sessionHealthBlocksQueue()) {
      const queued = queue[0];
      if (queued) {
        setSending("custom");
        setSendError(null);
        setDismissed(true);
        try {
          await onInject(project.tab, undefined, queued);
          removeFromQueue(0);
          markSent(intent);
        }
        catch (err) { setSendError(err instanceof Error ? err.message : "Send failed"); }
        finally { setSending(null); }
        return;
      }
    }
    setSending(intent);
    setSendError(null);
    setDismissed(true);
    try {
      await onRunWithBrain(project, intent);
      markSent(intent);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  };

  const send = async (promptKey?: string, customPrompt?: string) => {
    const dispatchId = promptKey ?? "custom";
    setSending(dispatchId);
    setSendError(null);
    setDismissed(true);
    try {
      if (customPrompt) {
        await onInject(project.tab, undefined, customPrompt);
      } else if (promptKey) {
        const intent = mapClaudePromptToIntent(promptKey);
        if (intent) {
          if (intent === "next_best") {
            const queued = queue[0];
            if (queued) {
              await onInject(project.tab, undefined, queued);
              removeFromQueue(0);
            } else {
              await onRunWithBrain(project, intent);
            }
          } else {
            await onRunWithBrain(project, intent);
          }
        } else {
          await onInject(project.tab, promptKey);
        }
      }
      // Only clear input on confirmed-successful custom send. setCustom("")
      // triggers setDraft(tab, "") which clears the localStorage draft too.
      if (!promptKey) setCustom("");
      markSent(dispatchId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  };

  const handleAutoInject = useCallback(async () => {
    if (!autoContinueEnabled) return;
    // Stop hook may have already injected — avoid double-fire from countdown.
    if (project.agentRunning || project.currentPrompt) return;
    // Agent-driven gate: handoff.status must explicitly say "ready" before
    // auto-inject can fire. Anything else (empty, "working", or any other
    // value) suppresses. This is the model-agnostic signal — any adapter
    // that writes the standard handoff format gets the same gating.
    // Health-critical bypasses the gate so recovery dispatches still fire.
    const status = (project.session?.status ?? "").toLowerCase();
    const healthCritical = (project.session?.health ?? "").toLowerCase().includes("critical");
    if (status !== "ready" && !healthCritical) return;
    if (sessionHealthBlocksQueue()) {
      await sendIntent("next_best");
      return;
    }
    const decision = preloadedDispatch;
    const action = decision?.action ?? (queue.length > 0 ? "queue" : "nextbest");
    // mode_gate may have returned "off" — suppress auto-inject entirely.
    if (action === "off") return;
    if (action === "queue") {
      const queued = queue[0];
      if (queued) {
        setSending("custom");
        setDismissed(true);
        try {
          await onInject(project.tab, undefined, queued);
          removeFromQueue(0);
        }
        finally { setSending(null); }
        return;
      }
    }
    // Strategist composer was removed in the 2026-06-11 collapse — no more
    // "composed" action coming back from dispatch. The dispatch route now
    // only returns "queue", "nextbest", or "off". If we get here it's
    // because the gate-evaluator picked nextbest (or the caller asked
    // without a queue head); fire the canned template.
    await sendIntent("next_best");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinueEnabled, preloadedDispatch, queue, removeFromQueue, project.tab, project.agentRunning, project.currentPrompt, onInject, setDismissed, project.session?.status, project.session?.health, project.session?.tests]);

  const handleSendFromQueue = useCallback(async (index: number) => {
    const item = queue[index];
    if (!item) return;
    // CRITICAL: do not remove from the queue until the send has confirmed
    // success. The previous order (remove → await → finally) destroyed the
    // queue item on any send failure (network drop, auth expiry, 5xx) —
    // same class as the 9c2525c sendCustom incident, but on the per-project
    // prompt queue instead of the custom input.
    setSending("custom");
    setSendError(null);
    setDismissed(true);
    try {
      await onInject(project.tab, undefined, item);
      removeFromQueue(index);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  }, [queue, removeFromQueue, project.tab, onInject, setDismissed]);

  const handleMergeQueue = useCallback(async () => {
    if (queue.length < 2) return;
    setMerging(true);
    try {
      const res = await postJson("/api/control/merge-prompts", { prompts: queue });
      const data = await res.json();
      if (data.merged) {
        clearQueue();
        setCustom(data.merged);
      }
    } catch { /* ignore */ } finally {
      setMerging(false);
    }
  }, [queue, clearQueue, setCustom]);

  // Keyboard: 1–9 dispatch prompt slots when this is the sole ready project on the page.
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const sendingRef = useRef(sending);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  useEffect(() => {
    if (!isOnlyReady) return;
    const handler = (e: KeyboardEvent) => {
      if (sendingRef.current) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key);
      if (!isNaN(n) && n >= 1 && n <= 9) {
        const all = [
          ...prompts.filter((p) => p.style === "primary"),
          ...prompts.filter((p) => p.style === "action"),
        ];
        const pick = all.find((p) => p.slot === n) ?? all[n - 1];
        if (pick) sendRef.current(pick.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOnlyReady, prompts]);

  return {
    sending,
    justSent,
    custom,
    setCustom,
    customFocused,
    setCustomFocused,
    merging,
    preloadedDispatch,
    sendError,
    clearSendError,
    sendCustom,
    sendText,
    sessionHealthBlocksQueue,
    sendIntent,
    send,
    handleAutoInject,
    handleSendFromQueue,
    handleMergeQueue,
  };
}

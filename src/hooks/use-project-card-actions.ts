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
import type { DispatchLiveView } from "@/lib/dispatch-status";
import type { Attachment } from "@/lib/loki/attachments";

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
  onInject: (
    tab: string,
    promptKey?: string,
    customPrompt?: string,
    attachments?: Attachment[],
  ) => Promise<{ commandId?: string | null } | void>;
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
  useEffect(
    () => () => {
      if (justSentTimer.current) clearTimeout(justSentTimer.current);
    },
    [],
  );
  // Lazy-init from localStorage draft so a failed send / page reload / tab
  // close doesn't drop the user's typed prompt. clearDraft is called only on
  // confirmed-successful sendCustom / sendText. See incident 2026-05-20:
  // mobile user sent from phone, request errored, draft lost.
  const [custom, _setCustom] = useState<string>(() => getDraft(project.tab));
  const setCustom = useCallback(
    (next: string) => {
      _setCustom(next);
      setDraft(project.tab, next);
    },
    [project.tab],
  );
  const [customFocused, setCustomFocused] = useState(false);
  const [merging, setMerging] = useState(false);
  const [preloadedDispatch, setPreloadedDispatch] = useState<DispatchResult | null>(null);
  // sendError surfaces dispatch failures inline near the send button — the
  // global ControlPanel error renders above the project cards and is invisible
  // on mobile when the user is scrolled down to a specific card. Inline error
  // means a failed send is impossible to miss.
  const [sendError, setSendError] = useState<string | null>(null);
  const clearSendError = useCallback(() => setSendError(null), []);

  // Honest dispatch status. A queued dispatch used to vanish into the ambient
  // dir-scoped guess — the card showed a green "working" the moment /api/inject
  // returned 200, even when the runner then failed to focus the tab and the
  // prompt never ran. We now poll the command's REAL lifecycle
  // (queued → picked up → ran / failed / unconfirmed) via
  // GET /api/control/commands/:id (SSOT: deriveDispatchLiveStatus) and surface
  // it on the card, so a failed dispatch is impossible to miss.
  const [dispatchStatus, setDispatchStatus] = useState<DispatchLiveView | null>(null);
  const clearDispatchStatus = useCallback(() => setDispatchStatus(null), []);
  // Cancellation token for the in-flight poll: a new dispatch (or unmount)
  // cancels the previous poll so two dispatches never fight over the banner.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  const trackDispatch = useCallback((commandId: string) => {
    if (pollRef.current) pollRef.current.cancelled = true;
    const token = { cancelled: false };
    pollRef.current = token;
    setDispatchStatus(null);
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~2 min at 3s — long enough to see a runner pick-up + run
    const poll = async () => {
      if (token.cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`/api/control/commands/${commandId}`);
        if (res.ok) {
          const view = (await res.json()) as DispatchLiveView;
          if (token.cancelled) return;
          setDispatchStatus(view);
          if (view.terminal) return; // settled — stop polling
        }
      } catch {
        /* transient network error — keep polling */
      }
      if (attempts >= MAX_ATTEMPTS || token.cancelled) return;
      setTimeout(() => {
        void poll();
      }, 3000);
    };
    void poll();
  }, []);
  useEffect(
    () => () => {
      if (pollRef.current) pollRef.current.cancelled = true;
    },
    [],
  );

  // Single funnel for user-initiated sends: fire the inject, then track the
  // returned command id. All the send* handlers below route through this so
  // tracking lives in exactly one place.
  const doInject = useCallback(
    async (tab: string, promptKey?: string, customPrompt?: string, attachments?: Attachment[]) => {
      const result = await onInject(tab, promptKey, customPrompt, attachments);
      const commandId = result && "commandId" in result ? result.commandId : null;
      if (commandId) trackDispatch(commandId);
      return result;
    },
    [onInject, trackDispatch],
  );

  // Pre-fetch dispatch decision as soon as the ready banner appears.
  // Note 2026-05-20: previously gated on queue.length > 0, which short-
  // circuited the strategist for the most-valuable case (empty queue,
  // smart-nudge needed). Now fires whenever ready — server decides what
  // to do based on auto_inject_mode + queue + handoff.
  // Leaving the ready state invalidates the preloaded decision. Guarded
  // render-time adjustment (not a sync setState in the effect below) — it
  // converges in one extra render and keeps the effect purely async.
  if (!isReadyNow && preloadedDispatch !== null) {
    setPreloadedDispatch(null);
  }
  useEffect(() => {
    if (!isReadyNow) return;
    const handoff = {
      done: project.session?.done ?? "",
      next: project.session?.next ?? "",
      health: project.session?.health ?? "",
      tests: project.session?.tests ?? "",
      todos: project.session?.todos ?? "",
      status: project.session?.status ?? "",
    };
    let cancelled = false;
    postJson("/api/control/dispatch", {
      handoff,
      blockerCount: 0,
      noOpCount: project.session?.noOpCount ?? 0,
      queue,
      projectName: project.tab,
      projectKey: project.tab,
      gitBranch: project.git?.branch,
      recentCommits: project.git?.recentCommits,
      mission: project.profile?.mission,
    })
      .then(async (res) => {
        if (!cancelled && res.ok) setPreloadedDispatch((await res.json()) as DispatchResult);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preload fires only on the ready-transition; payload fields are read fresh when it does
  }, [isReadyNow, queue.length]);

  const sessionHealthBlocksQueue = (): boolean => {
    const health = (project.session?.health ?? "").toLowerCase();
    const tests = (project.session?.tests ?? "").toLowerCase();
    return health.includes("critical") || tests.includes("fail");
  };

  const sendCustom = async (attachments?: Attachment[]) => {
    // A screenshot on its own is a complete instruction. Requiring words as
    // well would make the most natural mobile report — take a picture, send it
    // — the one thing the composer refuses.
    if (!custom.trim() && !attachments?.length) {
      // Never no-op silently: when the controlled state is empty while the
      // box LOOKS filled (dictation/autofill/synthetic input that bypassed
      // React onChange), Send previously did nothing with zero feedback.
      setSendError("Nothing to send — the composer is empty. Retype the prompt.");
      return;
    }
    const trimmed = custom.trim() || "Look at the attached screenshot and fix what is wrong.";
    setSending("custom");
    setSendError(null);
    setDismissed(true);
    try {
      // Mirror the smartEnqueue special case: if the user is deliberately sending
      // a handoff-controlled prompt (the exact workflow they use to drive the agent
      // from the UI), prefer direct execution over queueing.
      await doInject(project.tab, undefined, trimmed, attachments);
      setCustom("");
      markSent("custom");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(null);
    }
  };

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setSending("custom");
      setSendError(null);
      setDismissed(true);
      try {
        await doInject(project.tab, undefined, text.trim());
        // Belt-and-suspenders: sendText bypasses setCustom (the draft auto-clear
        // path), so explicit clearDraft after successful send.
        clearDraft(project.tab);
        markSent("custom");
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Send failed");
      } finally {
        setSending(null);
      }
    },
    [project.tab, doInject, setDismissed, markSent],
  );

  const sendIntent = async (intent: OrchestrationTaskIntentId) => {
    if (intent === "next_best" && !sessionHealthBlocksQueue()) {
      const queued = queue[0];
      if (queued) {
        setSending("custom");
        setSendError(null);
        setDismissed(true);
        try {
          await doInject(project.tab, undefined, queued);
          removeFromQueue(0);
          markSent(intent);
        } catch (err) {
          setSendError(err instanceof Error ? err.message : "Send failed");
        } finally {
          setSending(null);
        }
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
        await doInject(project.tab, undefined, customPrompt);
      } else if (promptKey) {
        const intent = mapClaudePromptToIntent(promptKey);
        if (intent) {
          if (intent === "next_best") {
            const queued = queue[0];
            if (queued) {
              await doInject(project.tab, undefined, queued);
              removeFromQueue(0);
            } else {
              await onRunWithBrain(project, intent);
            }
          } else {
            await onRunWithBrain(project, intent);
          }
        } else {
          await doInject(project.tab, promptKey);
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
        } finally {
          setSending(null);
        }
        return;
      }
    }
    // Strategist composer was removed in the 2026-06-11 collapse — no more
    // "composed" action coming back from dispatch. The dispatch route now
    // only returns "queue", "nextbest", or "off". If we get here it's
    // because the gate-evaluator picked nextbest (or the caller asked
    // without a queue head); fire the canned template.
    await sendIntent("next_best");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendIntent/toast helpers are stable closures; listed deps are the decision inputs
  }, [
    autoContinueEnabled,
    preloadedDispatch,
    queue,
    removeFromQueue,
    project.tab,
    project.agentRunning,
    project.currentPrompt,
    onInject,
    setDismissed,
    project.session?.status,
    project.session?.health,
    project.session?.tests,
  ]);

  const handleSendFromQueue = useCallback(
    async (index: number) => {
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
        await doInject(project.tab, undefined, item);
        removeFromQueue(index);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Send failed");
      } finally {
        setSending(null);
      }
    },
    [queue, removeFromQueue, project.tab, doInject, setDismissed],
  );

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
    } catch {
      /* ignore */
    } finally {
      setMerging(false);
    }
  }, [queue, clearQueue, setCustom]);

  // Keyboard: 1–9 dispatch prompt slots when this is the sole ready project on the page.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  const sendingRef = useRef(sending);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

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
    dispatchStatus,
    clearDispatchStatus,
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

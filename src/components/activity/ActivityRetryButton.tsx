"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import { useDispatchLiveStatus } from "@/hooks/use-dispatch-live-status";
import { dispatchToneDotClass } from "@/lib/dispatch-status";
import type { StatusTone } from "@/lib/constants/statuses";
import type { ActivityEvent } from "@/lib/activity-events";

/** The dispatch pipeline caps a custom prompt at 4000 chars (see the zod
 *  schema on /api/inject). Trim here so a long replay fails visibly at the
 *  edge rather than as a 400 the operator has to decode. */
const CUSTOM_PROMPT_MAX = 4000;

/**
 * Run the failed work again, from the page where you found out it failed.
 *
 * This replaces a link that said "Retry from Control" and did not retry. It
 * navigated to /control, where the Attention bar's retry acts on
 * `pending_commands` — a different table from the `orchestration_runs` this
 * feed shows. So the failure you clicked from was frequently not in that list
 * at all, and the button was a promise the app could not keep.
 *
 * What it does instead is what the words say: POST the same project + the same
 * instruction back through /api/inject (the identical path Control and Loki
 * dispatch on), then poll the real lifecycle so "queued behind an offline
 * builder" never looks like "running".
 *
 * Two replay shapes, and the difference matters:
 *   intent dispatch → send the intent ID and let the pipeline re-assemble the
 *     envelope from current project context. Replaying the stored envelope
 *     would hand the pipeline its own preamble to wrap a second time.
 *   custom prompt   → send the UNWRAPPED, untruncated task (PromptDisplay.task),
 *     never the preview, which is shortened for display and would silently
 *     re-run a truncated instruction.
 */
export function ActivityRetryButton({ event }: { event: ActivityEvent }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [commandId, setCommandId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const live = useDispatchLiveStatus(commandId, runId);

  const isCustom = event.intentId === "custom";
  const replayTask = event.ask?.task?.trim() ?? "";
  // A custom dispatch whose prompt text was never recorded cannot be replayed:
  // there is literally nothing to send. Offering the button anyway would be
  // the same broken promise in a new place.
  const canRetry = !event.isLocalChat && (!isCustom || replayTask.length > 0);
  if (!canRetry) return null;

  const run = async () => {
    setState("sending");
    setMessage(null);
    try {
      const res = await postJson("/api/inject", {
        tab: event.projectKey,
        ...(isCustom
          ? { customPrompt: replayTask.slice(0, CUSTOM_PROMPT_MAX) }
          : { promptKey: event.intentId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        blocked?: boolean;
        reason?: string;
        commandId?: string;
        runId?: string;
        mode?: string;
        message?: string;
      };
      if (!res.ok) {
        setState("error");
        setMessage(body.error ?? `Failed (${res.status})`);
        return;
      }
      // The runner reports "you are typing in this session right now" as a
      // successful no-op. Saying "Sent" over that would be a lie.
      if (body.blocked) {
        setState("error");
        setMessage(
          body.reason === "user-typing"
            ? "Not sent — you're typing in that session right now."
            : `Not sent — ${body.reason ?? "blocked"}.`,
        );
        return;
      }
      setCommandId(body.commandId ?? null);
      setRunId(body.runId ?? null);
      setState("sent");
      // A queue with no live builder is the case people most need told.
      if (body.message) setMessage(body.message);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Network error");
    }
  };

  // The button says what CLICKING does; the line under it says what the last
  // click led to. Folding the lifecycle into the button label (as this first
  // shipped) meant a settled run left no way back — and, worse, no colour: a
  // failed retry read exactly like a working one.
  const label =
    state === "sending"
      ? "Sending…"
      : state === "error"
        ? "Try again"
        : state === "sent" && live && !live.terminal
          ? "Sent"
          : "Run it again";

  // Errors and refusals come from the POST itself. Once a dispatch is
  // accepted the polled lifecycle is more current than the message stamped at
  // accept time, so it takes over — same tone vocabulary the Loki transcript,
  // the terminal composer and the prompt Run modal already render, because a
  // retry watched from Activity is the same dispatch watched from anywhere.
  const note: { tone: StatusTone; text: string } | null =
    state === "error" && message
      ? { tone: "warning", text: message }
      : state === "sent" && live
        ? { tone: live.tone, text: live.detail ? `${live.label} — ${live.detail}` : live.label }
        : state === "sent"
          ? { tone: "neutral", text: message ?? "Checking status…" }
          : null;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "sending"}
        title={
          isCustom
            ? "Re-send the same instruction to this project."
            : `Re-run "${event.intentLabel}" on ${event.projectKey}.`
        }
        className={cn("ui-needs-you-action", state === "error" && "text-status-warning")}
      >
        {state === "sending" ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="h-3 w-3" aria-hidden />
        )}
        {label}
      </button>
      {note && (
        <span className="ui-needs-you-note" role="status" aria-live="polite">
          <span className={dispatchToneDotClass(note.tone)} />
          {note.text}
        </span>
      )}
    </span>
  );
}

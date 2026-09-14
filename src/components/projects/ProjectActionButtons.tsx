"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Wrench, Zap } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { fleetSurfaceHref } from "@/lib/fleet-context";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import type { ProjectDispatchKind } from "@/lib/project-dispatch";

// Re-exported for existing importers (AskLokiButton) — SSOT lives in lib/project-dispatch.
export type { ProjectDispatchKind } from "@/lib/project-dispatch";

type DispatchState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; mode?: string }
  | { phase: "error"; message: string };

export function useProjectDispatch(projectId: string) {
  const [state, setState] = useState<DispatchState>({ phase: "idle" });

  const dispatch = async (kind: ProjectDispatchKind, signalKey?: string) => {
    setState({ phase: "sending" });
    try {
      const res = await postJson(`/api/projects/${projectId}/dispatch`, { kind, signalKey });
      const body = (await res.json()) as { ok?: boolean; mode?: string; error?: string };
      if (!res.ok || !body.ok) {
        setState({ phase: "error", message: body.error ?? "Dispatch failed" });
        return false;
      }
      setState({ phase: "done", mode: body.mode });
      return true;
    } catch {
      setState({ phase: "error", message: "Dispatch failed — network error" });
      return false;
    }
  };

  return { state, dispatch };
}

/** Inline confirmation after a successful queue: where to watch, and that
 *  a notification fires when the run finishes. Terminal is not the watch
 *  surface until a session is actually running. */
export function DispatchedNote({ workspaceKey }: { workspaceKey: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-status-positive">
      {EXECUTOR_COPY.honesty.queued}
      <Link
        href={fleetSurfaceHref("control", workspaceKey)}
        className="text-accent-text underline-offset-2 hover:underline"
      >
        Control
      </Link>
      <Link
        href={fleetSurfaceHref("activity", workspaceKey)}
        className="text-accent-text underline-offset-2 hover:underline"
      >
        Activity
      </Link>
      <span className="text-text-muted">
        {EXECUTOR_COPY.honesty.notificationWhenDone} {EXECUTOR_COPY.honesty.watchQueued}
      </span>
    </span>
  );
}

/** One-click "Fix" for an attention signal row on the profile. */
export function FixSignalButton({
  projectId,
  workspaceKey,
  signalKey,
}: {
  projectId: string;
  workspaceKey: string;
  signalKey: string;
}) {
  const { state, dispatch } = useProjectDispatch(projectId);

  if (state.phase === "done") return <DispatchedNote workspaceKey={workspaceKey} />;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => dispatch("fix_signal", signalKey)}
        disabled={state.phase === "sending"}
        className="ui-btn-secondary min-h-11 gap-1 px-2.5 text-xs"
      >
        {state.phase === "sending" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {state.phase === "sending" ? "Queuing…" : "Fix"}
      </button>
      {state.phase === "error" && <span className="ui-error text-xs">{state.message}</span>}
    </span>
  );
}

/**
 * The page's one "start work" control, rendered by ProjectBuildStatus whenever
 * nothing is running. It used to be a text-xs "Run next step" inside the Next
 * card — the same size as a chip, halfway down the page — so a person with an
 * idle project asked why there was no big button. There is now; it is this.
 * Same label as the kickoff hero, because it is the same act.
 */
export function MakeItHappenButton({
  projectId,
  workspaceKey,
  kind,
}: {
  projectId: string;
  workspaceKey: string;
  /** `next_step` runs the queued step; `kickoff` briefs from the description. */
  kind: Extract<ProjectDispatchKind, "next_step" | "kickoff">;
}) {
  const router = useRouter();
  const { state, dispatch } = useProjectDispatch(projectId);

  if (state.phase === "done") return <DispatchedNote workspaceKey={workspaceKey} />;
  return (
    <span className="inline-flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={async () => {
          // The refresh re-derives the build status server-side, so the strip
          // flips to "Starting up" from the run ledger, not from local state.
          if (await dispatch(kind)) router.refresh();
        }}
        disabled={state.phase === "sending"}
        className="ui-btn-primary min-h-12 gap-2 px-6 text-base"
      >
        {state.phase === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Zap className="h-4 w-4" aria-hidden="true" />
        )}
        {state.phase === "sending" ? "Making it happen…" : "Make it happen"}
      </button>
      {state.phase === "error" && <span className="ui-error text-xs">{state.message}</span>}
    </span>
  );
}

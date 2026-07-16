"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, ListChecks, Loader2, Monitor, Sparkles, TerminalSquare } from "lucide-react";
import { MarkdownText } from "@/components/ui/markdown-text";
import type { LokiMessage } from "./types";
import { dispatchStatusLabel, type DispatchLiveView } from "@/lib/dispatch-status";

const DISPATCH_DOT: Record<DispatchLiveView["tone"], string> = {
  positive: "ui-dot-positive",
  warning: "ui-dot-warning",
  negative: "ui-dot-negative",
  neutral: "ui-dot-neutral",
};

/** Poll a dispatch's live status so queued commands and direct terminal runs
 *  both converge on their recorded completion outcome instead of freezing on
 *  the optimistic snapshot. Stops as soon as the tracked lifecycle settles. */
function useDispatchLiveStatus(commandId: string | null, runId: string | null): DispatchLiveView | null {
  const [view, setView] = useState<DispatchLiveView | null>(null);
  useEffect(() => {
    const statusUrl = commandId
      ? `/api/control/commands/${commandId}`
      : runId
        ? `/api/orchestration/runs/${runId}`
        : null;
    if (!statusUrl) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(statusUrl);
        if (res.ok) {
          const v = (await res.json()) as DispatchLiveView;
          if (!active) return;
          setView(v);
          if (v.terminal) return;
        }
      } catch {
        /* transient — retry below */
      }
      if (active) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [commandId, runId]);
  return view;
}
import { LOKI_PROACTIVE_STARTERS } from "@/config/loki-suggested-actions";

/** Human-readable label for an assistant turn's kind badge. SSOT for the
 *  small set of kinds the messages route emits. */
const KIND_LABEL: Record<string, string> = {
  dispatch: "Dispatched",
  chat: "Loki",
  command: "Needs project",
};

/** Outcome footer under a dispatch bubble — tells the operator whether the work
 *  is running, queued, or stuck (runner offline), and links into Control to
 *  watch it. Reads the meta the messages route stamps on dispatch turns. */
function DispatchFooter({ meta }: { meta: Record<string, unknown> | null }) {
  // Hook first — before any early return — to satisfy rules-of-hooks. commandId
  // is read defensively so it's safe even when meta is null.
  const commandId = typeof meta?.commandId === "string" ? meta.commandId : null;
  const runId = typeof meta?.runId === "string" ? meta.runId : null;
  const live = useDispatchLiveStatus(commandId, runId);
  if (!meta) return null;
  const projectKey = typeof meta.projectKey === "string" ? meta.projectKey : null;
  const projectKeys = projectKey
    ? [projectKey]
    : Array.isArray(meta.projectKeys)
      ? meta.projectKeys.filter((v): v is string => typeof v === "string")
      : [];
  const primaryProject = projectKeys[0] ?? null;
  const failed = meta.ok === false;
  const runnerConnected =
    typeof meta.runnerConnected === "boolean" ? meta.runnerConnected : null;
  const { label: staticStatus, warn } = dispatchStatusLabel({
    ok: failed ? false : true,
    mode: typeof meta.mode === "string" ? meta.mode : null,
    warning: typeof meta.warning === "string" ? meta.warning : null,
    runnerConnected,
  });
  // Live status supersedes the frozen snapshot once the runner acts on the
  // command and keeps following the associated run through its real outcome.
  const status = live ? live.label : staticStatus;
  const dotClass = live ? DISPATCH_DOT[live.tone] : warn ? "ui-dot-warning" : "ui-dot-positive";
  // Only present when the operator pinned a non-default model in the composer.
  const agent = typeof meta.agent === "string" ? meta.agent : null;
  const model = typeof meta.model === "string" ? meta.model : null;
  const pinned = agent ? `${agent}${model ? ` · ${model}` : ""}` : null;
  const targetLabel =
    projectKeys.length === 0
      ? "No project target"
      : projectKeys.length === 1
        ? projectKeys[0]
        : `${projectKeys.length} projects`;
  return (
    <div className="ui-loki-dispatch-card">
      <div className="ui-loki-dispatch-status">
        <span className={dotClass} />
        <span className="font-medium text-text-primary">{status}</span>
        {live?.detail && <span className="text-text-tertiary">{live.detail}</span>}
        <span className="text-text-tertiary">Target: {targetLabel}</span>
        {pinned && <span className="text-text-tertiary">Agent: {pinned}</span>}
      </div>
      {primaryProject && (
        <div className="ui-loki-dispatch-actions">
          <Link href={`/control?focus=${encodeURIComponent(primaryProject)}`} className="ui-loki-dispatch-link">
            <Monitor className="h-3.5 w-3.5" />
            Control state
          </Link>
          <Link
            href={`/terminal?source=server&tab=${encodeURIComponent(primaryProject)}`}
            className="ui-loki-dispatch-link"
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            Cloud terminal
          </Link>
          <Link
            href={`/terminal?source=machine&tab=${encodeURIComponent(primaryProject)}`}
            className="ui-loki-dispatch-link"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            This computer
          </Link>
          {projectKeys.length > 1 && (
            <Link href="/control" className="ui-loki-dispatch-link">
              <Monitor className="h-3.5 w-3.5" />
              All selected
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Footer when a chat turn proposed a real action into the approval queue. Loki
 *  can only PROPOSE — this is the visible handoff to the operator, who approves
 *  it on Today before anything executes. */
function QueuedActionFooter({ meta }: { meta: Record<string, unknown> | null }) {
  const id = typeof meta?.queuedActionId === "string" ? meta.queuedActionId : null;
  if (!id) return null;
  const title = typeof meta?.queuedActionTitle === "string" ? meta.queuedActionTitle : "an action";
  return (
    <Link href="/today#actions" className="ui-loki-queued-action">
      <ListChecks className="h-3.5 w-3.5" />
      <span>Added to your approval queue: <strong>{title}</strong> — review to run it</span>
    </Link>
  );
}

/** One-tap project pick when a command needs a target project. */
function NeedsProjectPicker({
  meta,
  onPick,
}: {
  meta: Record<string, unknown> | null;
  onPick: (project: string, pendingText: string) => void;
}) {
  if (!meta?.needsProject) return null;
  const pendingText = typeof meta.pendingText === "string" ? meta.pendingText : "";
  const options = Array.isArray(meta.projectOptions)
    ? meta.projectOptions.filter((v): v is string => typeof v === "string")
    : [];
  if (!pendingText || options.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((name) => (
        <button
          key={name}
          type="button"
          className="ui-btn-chip"
          onClick={() => onPick(name, pendingText)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

export function Transcript({
  messages,
  loading = false,
  sending,
  onPickProject,
  onStart,
}: {
  messages: LokiMessage[];
  loading?: boolean;
  sending: boolean;
  onPickProject?: (project: string, pendingText: string) => void;
  /** Send a full prompt (proactive starters on the empty state). */
  onStart?: (prompt: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Pin to the latest turn as messages arrive (chat convention).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-muted" role="status">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation
      </div>
    );
  }

  // Empty transcript — instead of a passive "nothing here", Loki proactively
  // offers to look across the whole fleet. One tap runs a fleet-wide review from
  // its full context; it surfaces what needs attention and asks what it needs.
  if (messages.length === 0 && !sending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-md text-center">
          <Sparkles className="ui-empty-icon mx-auto" />
          <p className="ui-empty-title">Loki is watching your whole fleet</p>
          <p className="ui-empty-helper">
            Ask anything — or let it look across your projects and tell you what needs you.
          </p>
          {onStart && LOKI_PROACTIVE_STARTERS[0] && (
            <button
              type="button"
              onClick={() => onStart(LOKI_PROACTIVE_STARTERS[0].prompt)}
              className="ui-btn-primary mx-auto mt-4 justify-center gap-2 px-5"
            >
              <Sparkles className="h-4 w-4" />
              {LOKI_PROACTIVE_STARTERS[0].label}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="ui-loki-bubble ui-loki-bubble-user">
            {m.content}
          </div>
        ) : (
          <div key={m.id} className="flex flex-col">
            {m.kind && <span className="ui-loki-kind">{KIND_LABEL[m.kind] ?? m.kind}</span>}
            <div className="ui-loki-bubble ui-loki-bubble-assistant">
              <MarkdownText text={m.content} className="space-y-2" />
            </div>
            {m.kind === "command" && onPickProject && (
              <NeedsProjectPicker meta={m.meta} onPick={onPickProject} />
            )}
            {m.kind === "dispatch" && <DispatchFooter meta={m.meta} />}
            {m.kind === "chat" && <QueuedActionFooter meta={m.meta} />}
          </div>
        ),
      )}
      {sending && (
        <div className="ui-loki-bubble ui-loki-bubble-assistant flex items-center gap-2 text-text-tertiary" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loki is thinking
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

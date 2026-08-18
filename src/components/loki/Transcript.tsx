"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, ListChecks, Loader2, MessageCircle, Monitor, TerminalSquare } from "lucide-react";
import { MarkdownText, type CitationMap } from "@/components/ui/markdown-text";
import type { LokiMessage } from "./types";
import { dispatchStatusLabel, type DispatchLiveView } from "@/lib/dispatch-status";
import { isBuilderChannel } from "@/lib/constants/statuses";

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
/**
 * Build the citation resolver for one message from its persisted meta.
 *
 * Defensive by design: meta is opaque JSON that predates this field, so every
 * older message has no `sources` and must render cleanly rather than showing
 * bare handles. Returning undefined makes MarkdownText drop the markers.
 */
function citationsFrom(meta: Record<string, unknown> | null): CitationMap | undefined {
  const raw = meta?.sources;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const map: CitationMap = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, label, detail } = entry as { id?: unknown; label?: unknown; detail?: unknown };
    if (typeof id === "string" && typeof label === "string") {
      map[id] = { label, detail: typeof detail === "string" ? detail : "" };
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

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
    // Messages written before routing was recorded have no channel; those keep
    // the unnamed copy rather than being attributed to a guessed machine.
    channel: isBuilderChannel(meta.channel) ? meta.channel : null,
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

/** How many projects can sit in the chip grid before it needs a filter. Nine
 *  chips fill a phone screen; past that, scanning beats reading. */
const PICKER_FILTER_THRESHOLD = 8;

/**
 * One-tap project pick when a command needs a target project.
 *
 * Two things this must never be: a wall of chips with no way through, and a
 * dead end. A question that arrived without a project is still a question —
 * "Just answer" re-sends the same text as chat, so the operator is never
 * forced to name a project in order to be spoken to.
 */
function NeedsProjectPicker({
  meta,
  onPick,
  onAnswerAnyway,
}: {
  meta: Record<string, unknown> | null;
  onPick: (project: string, pendingText: string) => void;
  onAnswerAnyway?: (pendingText: string) => void;
}) {
  const [query, setQuery] = useState("");
  const pendingText = typeof meta?.pendingText === "string" ? meta.pendingText : "";
  const options = Array.isArray(meta?.projectOptions)
    ? meta.projectOptions.filter((v): v is string => typeof v === "string")
    : [];
  if (!meta?.needsProject) return null;
  if (!pendingText || options.length === 0) return null;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((name) => name.toLowerCase().includes(needle))
    : options;

  return (
    <div className="ui-loki-picker">
      {options.length > PICKER_FILTER_THRESHOLD && (
        <input
          className="ui-input-compact w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${options.length} projects…`}
          aria-label="Filter projects"
        />
      )}
      <div className="ui-loki-picker-grid">
        {shown.map((name) => (
          <button
            key={name}
            type="button"
            className="ui-loki-picker-chip"
            onClick={() => onPick(name, pendingText)}
          >
            {name}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="text-xs text-text-muted">No project matches “{query}”.</p>
        )}
      </div>
      {onAnswerAnyway && (
        <button
          type="button"
          className="ui-loki-picker-answer"
          onClick={() => onAnswerAnyway(pendingText)}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Just answer — don’t run anything
        </button>
      )}
    </div>
  );
}

export function Transcript({
  messages,
  loading = false,
  sending,
  onPickProject,
  onAnswerAnyway,
}: {
  messages: LokiMessage[];
  loading?: boolean;
  sending: boolean;
  onPickProject?: (project: string, pendingText: string) => void;
  /** Re-send the pending text as chat, so "needs project" is never a dead end. */
  onAnswerAnyway?: (pendingText: string) => void;
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

  // Empty start lives in the workspace (centered composer). Transcript stays
  // out of the way so the input is the only decision on screen.
  if (messages.length === 0 && !sending) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
      {/*
        Messages hug the composer instead of the top of the pane.
        Measured on a short answer: 398px of dead space sat between the last
        line and the input, because the scroll container is flex-1 (correct —
        it must own the scroll) while the content stacked from the top. An
        `mt-auto` inner column pushes a short transcript down to meet the
        composer and is inert once the content overflows, so long conversations
        still scroll normally.
      */}
      <div className="mt-auto flex flex-col gap-3">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="ui-loki-bubble ui-loki-bubble-user">
            {m.content}
          </div>
        ) : (
          <div key={m.id} className="flex flex-col">
            {m.kind && <span className="ui-loki-kind">{KIND_LABEL[m.kind] ?? m.kind}</span>}
            <div className="ui-loki-bubble ui-loki-bubble-assistant">
              <MarkdownText text={m.content} className="space-y-2" citations={citationsFrom(m.meta)} />
            </div>
            {m.kind === "command" && onPickProject && (
              <NeedsProjectPicker
                meta={m.meta}
                onPick={onPickProject}
                onAnswerAnyway={onAnswerAnyway}
              />
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
    </div>
  );
}

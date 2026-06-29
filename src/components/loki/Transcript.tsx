"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { MarkdownText } from "@/components/ui/markdown-text";
import type { LokiMessage } from "./types";
import { EXECUTOR_COPY } from "@/config/executor-copy";

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
  if (!meta) return null;
  const projectKey = typeof meta.projectKey === "string" ? meta.projectKey : null;
  const offline = meta.warning === "runner-offline";
  const failed = meta.ok === false;
  const warn = offline || failed;
  const status = failed
      ? "Dispatch failed"
      : offline
      ? EXECUTOR_COPY.queuedWhenOffline
      : meta.mode === "queued"
        ? EXECUTOR_COPY.queuedWhenOffline
        : meta.mode === "direct"
          ? "Running now"
          : "Dispatched";
  // Only present when the operator pinned a non-default model in the composer.
  const agent = typeof meta.agent === "string" ? meta.agent : null;
  const model = typeof meta.model === "string" ? meta.model : null;
  const pinned = agent ? `${agent}${model ? ` · ${model}` : ""}` : null;
  return (
    <div className="ui-loki-dispatch-foot">
      <span className={warn ? "ui-dot-warning" : "ui-dot-positive"} />
      <span>{status}</span>
      {pinned && <span className="text-text-tertiary">on {pinned}</span>}
      {projectKey && (
        <>
          <Link href={`/control?focus=${encodeURIComponent(projectKey)}`} className="ui-link-subtle">
            Open in Control →
          </Link>
          <Link
            href={`/terminal?source=server&tab=${encodeURIComponent(projectKey)}`}
            className="ui-link-subtle"
          >
            {EXECUTOR_COPY.loki.watchCloud}
          </Link>
          <Link
            href={`/terminal?source=machine&tab=${encodeURIComponent(projectKey)}`}
            className="ui-link-subtle"
          >
            {EXECUTOR_COPY.loki.watchThisComputer}
          </Link>
        </>
      )}
    </div>
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
  sending,
  onPickProject,
}: {
  messages: LokiMessage[];
  sending: boolean;
  onPickProject?: (project: string, pendingText: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Pin to the latest turn as messages arrive (chat convention).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  // Empty transcript — fresh thread (or none selected) with nothing in flight.
  if (messages.length === 0 && !sending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="ui-empty-block ui-empty-block-md">
          <MessageSquare className="ui-empty-icon" />
          <p className="ui-empty-title">Nothing here yet</p>
          <p className="ui-empty-helper">
            Ask anything, or dispatch a command like &ldquo;code review for kivvi&rdquo;.
          </p>
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
          </div>
        ),
      )}
      {sending && (
        <div className="ui-loki-bubble ui-loki-bubble-assistant">Thinking…</div>
      )}
      <div ref={endRef} />
    </div>
  );
}

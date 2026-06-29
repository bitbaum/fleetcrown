"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Activity, RotateCcw } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import type { ProjectState } from "@/lib/control-types";
import type { ActivityItem } from "@/db/queries/prompt-history";
import { buildProjectActivityLedger } from "./project-activity-ledger";
import {
  ALL_ACTIVITY_LINK,
  PROJECT_ACTIVITY_TITLE,
  RECENT_DISPATCHES_TITLE,
  recentDispatchChip,
} from "@/config/control-labels";

export function ProjectActivitySection({
  injections,
  git,
  projectTab,
  onReusePrompt,
}: {
  injections: ActivityItem[];
  git: ProjectState["git"];
  /** Project key for the full-history deep link into /activity. */
  projectTab?: string;
  /** Puts a past prompt back into the card's input for editing/re-dispatch. */
  onReusePrompt?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const ledger = buildProjectActivityLedger({ injections, git });
  const promptCount = ledger.filter((event) => event.kind === "user_prompt").length;
  const commitCount = ledger.filter((event) => event.kind === "git_commit").length;
  const hasGitActivity = (git?.todayCount ?? 0) > 0 || commitCount > 0;
  if (ledger.length === 0 && !hasGitActivity) return null;

  const copyPrompt = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => current === id ? null : current), 1500);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div className="border-t border-border-subtle px-4 py-2.5 sm:px-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 ui-link-muted"
      >
        <Activity className="h-3.5 w-3.5" />
        <span className="font-medium">{PROJECT_ACTIVITY_TITLE}</span>
        {promptCount > 0 && (
          <span className="text-text-muted/60" title="Prompts dispatched in the last 24h (up to 5 shown)">
            {recentDispatchChip(promptCount)}
          </span>
        )}
        {(git?.todayCount ?? 0) > 0 && (
          <span className="text-status-positive/80" title="Commits today">+{git?.todayCount} commits</span>
        )}
        <span className="ml-auto">{open ? "▴" : "▾"}</span>
      </button>
      {open && projectTab && (
        <Link
          href={`/activity?project=${encodeURIComponent(projectTab)}`}
          className="mt-2 inline-block ui-link-muted text-xs"
          title="Full unified history — every prompt, run outcome, and digest for this project"
        >
          {ALL_ACTIVITY_LINK}
        </Link>
      )}
      {open && (
        <div className="mt-3 space-y-4">
          {promptCount > 0 && (
            <div className="space-y-1.5">
              <p className="ui-kicker">{RECENT_DISPATCHES_TITLE}</p>
              {ledger.filter((event) => event.kind === "user_prompt").map((event) => {
                const fullText = event.body;
                const preview = fullText.length > 70 ? `${fullText.slice(0, 70).trimEnd()}...` : fullText;
                const isExpanded = expandedId === event.id;
                const canCopy = Boolean(fullText.trim());

                return (
                  <div key={event.id} className="rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-border-subtle hover:bg-surface-raised/50">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 pt-0.5 text-text-muted tabular-nums">
                        {event.occurredAt ? timeAgo(event.occurredAt) : ""}
                      </span>
                      {event.kind === "user_prompt" && event.intent && (
                        <span
                          className="shrink-0 mt-px rounded-full border border-accent-primary/30 bg-accent-muted px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-accent-text"
                          title={`Templated dispatch — intent: ${event.intent}`}
                        >
                          {event.intent.replace(/_/g, " ")}
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedId((current) => current === event.id ? null : event.id)}
                        className="min-w-0 flex-1 truncate text-left text-text-tertiary transition-colors hover:text-text-secondary"
                        title={fullText}
                      >
                        {preview}
                      </button>
                      {canCopy && onReusePrompt && (
                        <button
                          onClick={() => onReusePrompt(fullText)}
                          className="ui-icon-btn shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
                          title="Reuse — put this prompt back in the input to edit and send again"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                      {canCopy && (
                        <button
                          onClick={() => copyPrompt(event.id, fullText)}
                          className="ui-icon-btn shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
                          title="Copy full prompt"
                        >
                          {copiedId === event.id ? <Check className="h-3 w-3 text-status-positive" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-2 rounded-lg border border-border-subtle bg-surface-overlay p-3">
                        <pre className="max-h-48 whitespace-pre-wrap break-words text-xs leading-relaxed text-text-secondary">{fullText}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {commitCount > 0 && (
            <div className="space-y-1.5">
              <p className="ui-kicker">Recent commits</p>
              <div className="space-y-1.5">
                {ledger.filter((event) => event.kind === "git_commit").map((event) => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 font-mono text-text-muted/60 tabular-nums">{event.title}</span>
                    <span className="min-w-0 flex-1 text-text-tertiary">{event.body}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

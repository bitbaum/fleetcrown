"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, CornerDownRight, ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/lib/activity-events";
import { OUTCOME_TAG_CLASS, formatClockTime } from "./activity-shared";

/**
 * One unit of work, told as a sentence.
 *
 * The old row was four competing fragments on one wrapping line — timestamp,
 * project, "Claude - Next best - timeout", a right-floated duration — over a
 * grey body that, for most rows, said "assembled operator dispatch (full text
 * hidden)". On a phone it wrapped into a ragged block that answered nothing.
 *
 * The shape here is fixed and reads top-down at any width:
 *   line 1   project - outcome - when          (what/where/status)
 *   line 2   what you asked for                (the whole point)
 *   line 3   what came back, or why it failed  (the payoff)
 *   line 4   what happens next, when known     (the only actionable line)
 *
 * Everything below line 1 is optional and simply absent when there is nothing
 * true to put there — an empty row is more honest than a padded one.
 */
export function ActivityEventRow({ event }: { event: ActivityEvent }) {
  const [open, setOpen] = useState(false);
  const canExpand = Boolean(event.ask?.expandable || (event.error && event.error.length > 160));

  const askText = event.ask?.missing
    ? null
    : event.ask?.preview || null;

  return (
    <li className={cn("ui-activity-row", event.status === "negative" && "ui-activity-row-alert")}>
      {/* Line 1 — the header. Project leads: it is what someone scans for. */}
      <div className="ui-activity-head">
        <span className={cn("ui-activity-dot", `ui-dot-${event.status === "neutral" ? "neutral" : event.status}`)} aria-hidden />
        <span className="ui-activity-project">{event.projectKey}</span>
        <span className={cn("ui-tag", OUTCOME_TAG_CLASS[event.outcome])}>{event.outcomeLabel}</span>
        <span className="ui-activity-meta">
          {formatClockTime(event.occurredAt)}
          {event.durationLabel && <> · {event.durationLabel}</>}
        </span>
      </div>

      {/* Line 1b — provenance, quiet. Which agent, which intent. */}
      <p className="ui-activity-sub">
        {event.agentLabel} · {event.intentLabel}
      </p>

      {/* Line 2 — the ask. THE thing the old page could not show. */}
      {askText && (
        <p className={cn("ui-activity-ask", !open && "line-clamp-3")}>{askText}</p>
      )}
      {event.ask?.missing && (
        <p className="ui-activity-ask-missing">
          No prompt text was recorded for this dispatch.
        </p>
      )}

      {/* Line 3 — the payoff: what came back, or why it did not. */}
      {event.done && (
        <p className={cn("ui-activity-done", !open && "line-clamp-3")}>{event.done}</p>
      )}
      {event.error && (
        <p className={cn("ui-activity-error", !open && "line-clamp-3")}>{event.error}</p>
      )}

      {/* Cross-model verdict — a second lineage judged this handoff. */}
      {event.verification && (
        <p className={cn("ui-activity-verify", event.verification.met ? "text-status-positive" : "text-status-warning")}>
          {event.verification.met ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>
            {event.verification.met
              ? `Verified by ${shortJudge(event.verification.judge)}`
              : `${shortJudge(event.verification.judge)} says not done${event.verification.gap ? `: ${event.verification.gap}` : ""}`}
          </span>
        </p>
      )}

      {/* Line 4 — the only forward-looking line, so it gets the arrow. */}
      {event.next && (
        <p className="ui-activity-next">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
          <span className={cn(!open && "line-clamp-2")}>{event.next}</span>
        </p>
      )}

      {/* Full prompt, on demand. Monospace because this is the literal payload
          that was sent, not prose about it. */}
      {open && event.ask?.full && (
        <div className="ui-activity-full">
          <p className="ui-micro-label mb-1.5">Exactly what was sent</p>
          <pre className="ui-activity-pre">{event.ask.full}</pre>
        </div>
      )}

      <div className="ui-activity-actions">
        {canExpand && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ui-activity-toggle"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Less" : "Show full prompt"}
          </button>
        )}
        {/* A failure a person cannot act on is just bad news. Give it a door. */}
        {event.status === "negative" && (
          <Link
            href={`/terminal?tab=${encodeURIComponent(event.projectKey)}`}
            className="ui-activity-action"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open session
          </Link>
        )}
      </div>
    </li>
  );
}

/** `anthropic/claude-opus-4` reads as `claude-opus-4` in a 4-inch column. */
function shortJudge(judge: string): string {
  return judge.includes("/") ? (judge.split("/").pop() ?? judge) : judge;
}

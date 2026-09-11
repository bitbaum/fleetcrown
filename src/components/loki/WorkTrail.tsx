"use client";

import { Check, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toolLabel } from "@/config/loki-tool-labels";
import type { LiveTool } from "@/hooks/use-loki-stream";

/**
 * What Loki actually did to answer — the tools it ran, as it runs them.
 *
 * This is the part the old surface threw away. `runLokiTurn` has always
 * returned `toolsUsed`, carrying the comment "surfaced so the UI can show
 * work", and no caller ever surfaced it: a turn that searched your people,
 * read your projects and queried the knowledge graph rendered as one static
 * "Loki is thinking" line for as long as it took.
 *
 * Collapsed to a single summary line once the answer arrives, because by then
 * the answer is the thing being read and the trail is provenance you open when
 * you doubt it.
 */
export function WorkTrail({
  tools,
  /** True while the turn is still running — keeps the trail open and live. */
  live,
}: {
  tools: LiveTool[];
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (tools.length === 0) return null;

  // A running turn shows its work; a finished one offers it.
  const expanded = live || open;
  const failed = tools.filter((t) => t.phase === "fail").length;
  const records = tools.reduce((n, t) => n + (t.facts ?? 0), 0);

  const summary = live
    ? (toolLabel(tools[tools.length - 1].name, tools[tools.length - 1].phase) ?? "Working")
    : [
        `${tools.length} ${tools.length === 1 ? "step" : "steps"}`,
        // "0 records" is a real and useful answer — it is how an operator
        // learns the tool ran and their data is genuinely empty, rather than
        // assuming it never ran.
        `${records} ${records === 1 ? "record" : "records"}`,
        failed > 0 ? `${failed} failed` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="ui-loki-trail">
      <button
        type="button"
        className="ui-loki-trail-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        // While live the trail is not a disclosure — it is the status line.
        disabled={live}
      >
        {live ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <ChevronRight
            className={
              expanded ? "ui-loki-trail-caret ui-loki-trail-caret-open" : "ui-loki-trail-caret"
            }
            aria-hidden
          />
        )}
        <span className="truncate">{summary}</span>
      </button>

      {expanded && (
        <ul className="ui-loki-trail-list">
          {tools.map((tool, i) => (
            <li key={`${tool.name}-${i}`} className="ui-loki-trail-step">
              {tool.phase === "start" ? (
                <Loader2 className="ui-loki-trail-icon animate-spin" aria-hidden />
              ) : tool.phase === "fail" ? (
                <TriangleAlert className="ui-loki-trail-icon text-status-warning" aria-hidden />
              ) : (
                <Check className="ui-loki-trail-icon text-status-positive" aria-hidden />
              )}
              <span className="truncate">{toolLabel(tool.name, tool.phase)}</span>
              {tool.phase === "end" && (
                <span className="ui-loki-trail-count">
                  {tool.facts ?? 0} {(tool.facts ?? 0) === 1 ? "record" : "records"}
                </span>
              )}
              {/* A failed tool is not an empty result. Saying "nothing found"
                  here would teach the operator their data is empty when in
                  fact the lookup never completed. */}
              {tool.phase === "fail" && <span className="ui-loki-trail-count">unavailable</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

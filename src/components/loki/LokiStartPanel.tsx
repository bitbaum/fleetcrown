"use client";

import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { shortTimeAgo } from "@/lib/dates";
import type { ConversationSummary } from "./types";

/** How many threads the start screen offers before deferring to the full list.
 *  Four rows is what fits above a docked composer on a 320px phone without
 *  pushing the input out of thumb reach — the constraint that set the number. */
const RESUME_LIMIT = 4;

/**
 * What sits above the composer on a fresh /loki.
 *
 * The start screen used to be a single composer card centred in the pane. On a
 * desktop that reads as focus. On a phone — measured on a 2340px-tall device —
 * it was ~600px of empty grey above the card and ~400px below it, with the one
 * interactive element floating in the middle of the screen, out of thumb reach
 * and next to nothing that told you what this page had been doing for you.
 *
 * Emptiness is not calm when the operator already has work in flight. This
 * panel spends that space on the only thing that is both true and useful before
 * a word is typed: the threads you were last in, one tap from resuming. When
 * there is genuinely nothing yet, it says so in one line and gets out of the
 * way — the composer's own starter chips carry the first run.
 */
export function LokiStartPanel({
  conversations,
  loading,
  onResume,
  onBrowseAll,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  onResume: (id: string) => void;
  onBrowseAll: () => void;
}) {
  const recent = conversations.slice(0, RESUME_LIMIT);

  if (loading && conversations.length === 0) return null;

  return (
    <div className="ui-loki-start">
      <p className="ui-loki-start-lede">
        {recent.length > 0
          ? "Pick up where you left off"
          : "Ask anything, or send work to a project."}
      </p>

      {recent.length > 0 && (
        <ul className="ui-loki-start-list">
          {recent.map((convo) => (
            <li key={convo.id}>
              <button
                type="button"
                className="ui-loki-start-row"
                onClick={() => onResume(convo.id)}
              >
                <MessagesSquare className="ui-loki-start-row-icon" aria-hidden="true" />
                <span className="ui-loki-start-row-text">
                  <span className="ui-loki-start-row-title">{convo.title}</span>
                  <span className="ui-loki-start-row-meta">
                    {convo.projectKeys.length > 0 && (
                      <span className="truncate">{convo.projectKeys.join(" · ")}</span>
                    )}
                    <span className="shrink-0">{shortTimeAgo(Date.parse(convo.updatedAt))}</span>
                  </span>
                </span>
                <ArrowUpRight className="ui-loki-start-row-go" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {conversations.length > RESUME_LIMIT && (
        <button type="button" className="ui-loki-start-more" onClick={onBrowseAll}>
          All {conversations.length} chats
        </button>
      )}
    </div>
  );
}

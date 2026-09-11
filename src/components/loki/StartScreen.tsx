"use client";

import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { shortTimeAgo } from "@/lib/dates";
import type { ConversationSummary } from "./types";

/** Threads offered before deferring to the rail. Four is what fits above a
 *  docked composer on a 320px phone without pushing the input out of reach. */
const RESUME_LIMIT = 4;

/**
 * What a fresh /loki shows.
 *
 * The old start screen was a headline, a subtitle and one orange button
 * floating in roughly a thousand pixels of empty grey — measured on a
 * 2340px-tall phone, ~600px above and ~400px below. Emptiness is not calm when
 * the operator already has work in flight.
 *
 * So the space goes to the only thing that is both true and useful before a
 * word is typed: the threads you were last in, one tap from resuming. With
 * nothing to resume it says one line and gets out of the way — the composer's
 * own starter chips carry the first run.
 */
export function StartScreen({
  conversations,
  loading,
  onResume,
  onBrowseAll,
  railVisible,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  onResume: (id: string) => void;
  onBrowseAll: () => void;
  /** The rail is already on screen, listing these very threads. */
  railVisible: boolean;
}) {
  // Offering the same four threads twice, side by side, is the problem this
  // rebuild set out to remove — it is the old four-navigations-for-two-actions
  // bug in a new place. When the rail is open it owns resuming, and the start
  // screen is just the greeting over the composer.
  const recent = railVisible ? [] : conversations.slice(0, RESUME_LIMIT);

  // Nothing is rendered while the list is still unknown. A greeting that
  // appears and is immediately shoved up the screen by four rows is worse than
  // a beat of nothing.
  if (loading && conversations.length === 0) return null;

  return (
    <div className="ui-loki-start">
      <h1 className="ui-loki-start-title">
        {recent.length > 0 ? "Pick up where you left off" : "What are we working on?"}
      </h1>

      {recent.length > 0 && (
        <ul className="ui-loki-start-list">
          {recent.map((convo) => (
            <li key={convo.id}>
              <button
                type="button"
                className="ui-loki-start-row"
                onClick={() => onResume(convo.id)}
              >
                <MessagesSquare className="ui-loki-start-row-icon" aria-hidden />
                <span className="ui-loki-start-row-text">
                  <span className="ui-loki-start-row-title">{convo.title}</span>
                  <span className="ui-loki-start-row-meta">
                    {convo.projectKeys.length > 0 && (
                      <span className="truncate">{convo.projectKeys.join(" · ")}</span>
                    )}
                    <span className="shrink-0">{shortTimeAgo(Date.parse(convo.updatedAt))}</span>
                  </span>
                </span>
                <ArrowUpRight className="ui-loki-start-row-go" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!railVisible && conversations.length > RESUME_LIMIT && (
        <button type="button" className="ui-loki-start-more" onClick={onBrowseAll}>
          All {conversations.length} chats
        </button>
      )}
    </div>
  );
}

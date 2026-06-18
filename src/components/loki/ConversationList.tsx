"use client";

import { Plus } from "lucide-react";
import type { ConversationSummary } from "./types";

export function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <button type="button" className="ui-btn-secondary" onClick={onNew}>
        <Plus className="h-4 w-4" />
        New
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="ui-loki-convo-meta px-3">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="ui-loki-convo-meta px-3">No conversations yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`ui-loki-convo ${c.id === activeId ? "ui-loki-convo-active" : ""}`}
              >
                <div className="ui-loki-convo-title">{c.title}</div>
                {c.projectKeys.length > 0 && (
                  <div className="ui-loki-convo-meta">{c.projectKeys.join(", ")}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

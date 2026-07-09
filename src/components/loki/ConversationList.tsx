"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LokiPaneBody } from "./LokiPaneBody";
import { shortTimeAgo } from "@/lib/dates";
import type { ConversationSummary } from "./types";

export function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  onRetry,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [armedId, setArmedId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    if (armedId === id) {
      setArmedId(null);
      onDelete(id);
    } else {
      setArmedId(id);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <button type="button" className="ui-btn-secondary" onClick={onNew}>
        <Plus className="h-4 w-4" />
        New
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <LokiPaneBody loading={loading} error={error} onRetry={onRetry}>
          {conversations.length === 0 ? (
            <p className="ui-loki-convo-meta px-3">No conversations yet — start one.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {conversations.map((c) => {
                const armed = armedId === c.id;
                return (
                  <div key={c.id} className="ui-loki-convo-row group/convo">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className={`ui-loki-convo pr-10 ${c.id === activeId ? "ui-loki-convo-active" : ""}`}
                    >
                      <div className="ui-loki-convo-title">{c.title}</div>
                      {/* Always show a meta line: project(s) + when. Many threads
                          share the same opening line ("move forward on …"); the
                          timestamp is what makes them distinguishable. */}
                      <div className="ui-loki-convo-meta">
                        {[c.projectKeys.join(", "), shortTimeAgo(Date.parse(c.updatedAt))]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(c.id)}
                      onBlur={() => armed && setArmedId(null)}
                      aria-label={armed ? `Confirm delete ${c.title}` : `Delete ${c.title}`}
                      title={armed ? "Click again to delete" : "Delete conversation"}
                      className={`ui-loki-convo-delete group-hover/convo:opacity-100 ${armed ? "ui-loki-convo-delete-armed" : ""}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </LokiPaneBody>
      </div>
    </div>
  );
}

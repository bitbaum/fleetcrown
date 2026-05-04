"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { CHANNEL_NAMES } from "@/config/channels";
import { APP_LOCALE } from "@/lib/constants";
import { ADD_BUTTON_CLASS, FIELD_INPUT_CLASS_TIGHT, INLINE_SAVE_CLASS } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { postJson } from "@/lib/api/fetch";
import { toLocalDateStr } from "@/lib/dates";
import { INTERACTION_DIRECTION, type InteractionDirection } from "@/lib/constants/statuses";
import { Section } from "./PersonDetailHelpers";
import type { Interaction } from "./person-detail-types";

export function InteractionsSection({
  personId,
  interactions: list,
  onAdd,
}: {
  personId: string;
  interactions: Interaction[];
  onAdd: (ix: Interaction) => void;
}) {
  const [logging, setLogging] = useState(false);
  const [channel, setChannel] = useState(CHANNEL_NAMES[0] ?? "whatsapp");
  const [direction, setDirection] = useState<InteractionDirection>(INTERACTION_DIRECTION.OUTBOUND);
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalDateStr(new Date()));
  const [saving, setSaving] = useState(false);

  const handleLog = async () => {
    setSaving(true);
    try {
      const res = await postJson(`/api/people/${personId}/interactions`, {
        channel,
        direction,
        summary: summary || undefined,
        occurredAt,
      });
      const data = await res.json();
      if (data.ok) {
        onAdd({ channel, direction, summary: summary || null, occurredAt });
        setLogging(false);
        setSummary("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Recent Activity">
      {list.length === 0 && !logging && (
        <EmptyState>No interactions recorded</EmptyState>
      )}
      {list.map((ix, i) => (
        <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${ix.direction === INTERACTION_DIRECTION.INBOUND ? "text-text-muted" : "text-status-positive/60"}`}>
              {ix.direction === INTERACTION_DIRECTION.INBOUND ? "←" : "→"}
            </span>
            <span className="text-text-secondary">{ix.channel}</span>
            {ix.summary && <span className="max-w-[180px] truncate text-xs text-text-tertiary">{ix.summary}</span>}
          </div>
          <span className="shrink-0 text-xs text-text-tertiary">
            {new Date(ix.occurredAt).toLocaleDateString(APP_LOCALE)}
          </span>
        </div>
      ))}

      {logging ? (
        <div className="mt-2 space-y-2 border-t border-border-subtle pt-3">
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
            >
              {CHANNEL_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as InteractionDirection)}
              className={FIELD_INPUT_CLASS_TIGHT}
            >
              <option value={INTERACTION_DIRECTION.OUTBOUND}>→ out</option>
              <option value={INTERACTION_DIRECTION.INBOUND}>← in</option>
            </select>
          </div>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief note (optional)"
            onKeyDown={(e) => { if (e.key === "Enter") handleLog(); if (e.key === "Escape") setLogging(false); }}
            autoFocus
            className={`w-full ${FIELD_INPUT_CLASS_TIGHT}`}
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
            />
            <button
              onClick={handleLog}
              disabled={saving}
              className={INLINE_SAVE_CLASS}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </button>
            <button onClick={() => setLogging(false)} className="px-1 text-xs text-text-tertiary hover:text-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setLogging(true)}
          className={`${ADD_BUTTON_CLASS} mt-1`}
        >
          <Plus className="h-3.5 w-3.5" /> Log interaction
        </button>
      )}
    </Section>
  );
}

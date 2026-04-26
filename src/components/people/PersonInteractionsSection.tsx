"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { CHANNEL_NAMES } from "@/config/channels";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { postJson } from "@/lib/api/fetch";
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
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().split("T")[0]);
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
        <div key={i} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${ix.direction === "inbound" ? "text-blue-400/60" : "text-emerald-400/60"}`}>
              {ix.direction === "inbound" ? "←" : "→"}
            </span>
            <span className="text-white/50">{ix.channel}</span>
            {ix.summary && <span className="text-xs text-white/30 truncate max-w-[140px]">{ix.summary}</span>}
          </div>
          <span className="text-xs text-white/30 shrink-0">
            {new Date(ix.occurredAt).toLocaleDateString("de-CH")}
          </span>
        </div>
      ))}

      {logging ? (
        <div className="mt-2 space-y-2 pt-2 border-t border-white/[0.06]">
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
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
              className={FIELD_INPUT_CLASS_TIGHT}
            >
              <option value="outbound">→ out</option>
              <option value="inbound">← in</option>
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
              className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </button>
            <button onClick={() => setLogging(false)} className="text-xs text-white/30 hover:text-white/60 px-1">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setLogging(true)}
          className="flex items-center gap-1.5 text-xs text-white/25 hover:text-emerald-400 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Log interaction
        </button>
      )}
    </Section>
  );
}

"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { CHANNEL_NAMES, isChannelAttrKey, stripChannelPrefix, withChannelPrefix } from "@/config/channels";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, ChannelIcon } from "./PersonDetailHelpers";
import { formatChannelValue } from "./person-detail-types";

export function ChannelsSection({
  personId,
  attrs,
  onUpdate,
}: {
  personId: string;
  attrs: Record<string, string>;
  onUpdate: (updated: Record<string, string>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [channelType, setChannelType] = useState(CHANNEL_NAMES[0] ?? "whatsapp");
  const [channelValue, setChannelValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const channels = Object.entries(attrs).filter(([k]) => isChannelAttrKey(k));

  const saveChannel = async () => {
    if (!channelValue.trim() || saving) return;
    setSaving(true);
    const key = withChannelPrefix(channelType);
    try {
      await setAttr(`/api/people/${personId}`, key, channelValue.trim());
      onUpdate({ ...attrs, [key]: channelValue.trim() });
      setChannelValue("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (key: string) => {
    setDeletingKey(key);
    try {
      await removeAttr(`/api/people/${personId}`, key);
      const next = { ...attrs };
      delete next[key];
      onUpdate(next);
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Section title="Channels">
      {channels.map(([key, value]) => (
        <div key={key} className="group flex items-center gap-2 text-sm">
          <ChannelIcon channel={key} />
          <span className="text-white/70 shrink-0">{stripChannelPrefix(key)}</span>
          <span className="text-white/40 font-mono text-xs truncate flex-1">{formatChannelValue(value)}</span>
          <button
            onClick={() => deleteChannel(key)}
            disabled={deletingKey === key}
            className="sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-white/20 hover:text-red-400 transition-all shrink-0"
          >
            {deletingKey === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
          </button>
        </div>
      ))}
      {channels.length === 0 && !adding && (
        <EmptyState>No channels yet</EmptyState>
      )}
      {adding ? (
        <div className="flex gap-1.5 items-center pt-0.5">
          <select
            value={channelType}
            onChange={(e) => setChannelType(e.target.value)}
            className={`${FIELD_INPUT_CLASS_TIGHT} shrink-0`}
          >
            {CHANNEL_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={channelValue}
            onChange={(e) => setChannelValue(e.target.value)}
            placeholder="handle or number"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveChannel();
              if (e.key === "Escape") { setAdding(false); setChannelValue(""); }
            }}
            autoFocus
            className={`flex-1 min-w-0 ${FIELD_INPUT_CLASS_TIGHT}`}
          />
          <button
            onClick={saveChannel}
            disabled={!channelValue.trim() || saving}
            className="p-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-white shrink-0"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </button>
          <button onClick={() => { setAdding(false); setChannelValue(""); }} className="p-1 text-white/25 hover:text-white/60">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-white/20 hover:text-emerald-400 transition-colors mt-0.5"
        >
          <Plus className="h-3 w-3" /> Add channel
        </button>
      )}
    </Section>
  );
}

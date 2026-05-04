"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { CHANNEL_NAMES, isChannelAttrKey, stripChannelPrefix, withChannelPrefix } from "@/config/channels";
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
        <div key={key} className="group flex items-center gap-3 ui-list-row">
          <ChannelIcon channel={key} />
          <span className="shrink-0 text-text-secondary">{stripChannelPrefix(key)}</span>
          <span className="flex-1 truncate font-mono text-xs text-text-tertiary">{formatChannelValue(value)}</span>
          <button
            onClick={() => deleteChannel(key)}
            disabled={deletingKey === key}
            className="shrink-0 ui-hover-reveal ui-btn-icon"
          >
            {deletingKey === key ? <Loader2 className="ui-spinner-2xs" /> : <X className="h-2.5 w-2.5" />}
          </button>
        </div>
      ))}
      {channels.length === 0 && !adding && (
        <EmptyState>No channels yet</EmptyState>
      )}
      {adding ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <select
            value={channelType}
            onChange={(e) => setChannelType(e.target.value)}
            className="ui-input-tight shrink-0"
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
            className="flex-1 min-w-0 ui-input-tight"
          />
          <button
            onClick={saveChannel}
            disabled={!channelValue.trim() || saving}
            className="ui-btn-icon-accent p-1.5"
          >
            {saving ? <Loader2 className="ui-spinner-xs" /> : <Save className="h-3 w-3" />}
          </button>
          <button onClick={() => { setAdding(false); setChannelValue(""); }} className="ui-btn-icon">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-text-tertiary transition-colors hover:text-accent-text"
        >
          <Plus className="h-3 w-3" /> Add channel
        </button>
      )}
    </Section>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { X, MessageCircle, Link2, Plus, Loader2 } from "lucide-react";
import { CHANNEL_CONFIG } from "@/config/channels";

const CHANNELS = ["whatsapp", "telegram", "email", "phone", "in-person", "other"] as const;
type Channel = typeof CHANNELS[number];

type PersonDetailData = {
  id: string;
  name: string;
  type: string;
  externalId: string | null;
  description: string | null;
  attrs: Record<string, string>;
  relations: Array<{
    type: string;
    strength: number | null;
    targetId: string;
    targetName: string;
    targetType: string;
  }>;
  interactions: Array<{
    channel: string;
    direction: string;
    summary: string | null;
    occurredAt: string;
  }>;
};

export function PersonDetail({
  personId,
  onClose,
}: {
  personId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/people/${personId}`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [personId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/10 overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-background">
          <h2 className="text-lg font-semibold truncate">{data?.name ?? "Loading..."}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-4 text-white/30 animate-pulse">Loading...</div>
        ) : !data ? (
          <div className="p-4 text-white/30">Person not found</div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Channels */}
            <Section title="Channels">
              {Object.entries(data.attrs)
                .filter(([k]) => k.startsWith("channel:"))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <ChannelIcon channel={key} />
                    <span className="text-white/70">{key.replace("channel:", "")}</span>
                    <span className="text-white/40 font-mono text-xs truncate">{formatChannelValue(value)}</span>
                  </div>
                ))}
            </Section>

            {/* Attributes */}
            <Section title="Details">
              {Object.entries(data.attrs)
                .filter(([k]) => !k.startsWith("channel:") && k !== "aliases")
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 text-sm">
                    <span className="text-white/50">{formatKey(key)}</span>
                    <span className="text-right truncate">{value}</span>
                  </div>
                ))}
              {Object.keys(data.attrs).filter(
                (k) => !k.startsWith("channel:") && k !== "aliases",
              ).length === 0 && (
                <div className="text-sm text-white/30">No details yet</div>
              )}
            </Section>

            {/* Aliases */}
            {data.attrs["aliases"] && (
              <Section title="Aliases">
                <div className="flex flex-wrap gap-1.5">
                  {parseAliases(data.attrs["aliases"]).map((alias) => (
                    <span
                      key={alias}
                      className="px-2 py-0.5 text-xs bg-white/10 rounded-full text-white/60"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent Interactions */}
            <InteractionsSection personId={data.id} initialInteractions={data.interactions} />

            {/* Relations */}
            {data.relations.length > 0 && (
              <Section title="Connections">
                {data.relations.map((rel, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Link2 className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-white/50">{rel.type}</span>
                    <span>{rel.targetName}</span>
                    <span className="text-xs text-white/30">({rel.targetType})</span>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Interaction = PersonDetailData["interactions"][number];

function InteractionsSection({
  personId,
  initialInteractions,
}: {
  personId: string;
  initialInteractions: Interaction[];
}) {
  const [list, setList] = useState<Interaction[]>(initialInteractions);
  const [logging, setLogging] = useState(false);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const handleLog = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/people/${personId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, direction, summary: summary || undefined, occurredAt }),
      });
      const data = await res.json();
      if (data.ok) {
        setList((prev) => [
          { channel, direction, summary: summary || null, occurredAt },
          ...prev,
        ]);
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
        <div className="text-sm text-white/30">No interactions recorded</div>
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
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
              className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
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
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return <MessageCircle className="h-3.5 w-3.5 text-white/30" />;
  const Icon = config.icon;
  return <Icon className={`h-3.5 w-3.5 ${config.color}`} />;
}

function parseAliases(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [raw];
  }
}

// "relationship_to_george" → "Relationship to george"
function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Strip storage format prefixes from channel values: "e164:+41763217721" → "+41763217721"
function formatChannelValue(value: string): string {
  return value.replace(/^e164:/, "");
}

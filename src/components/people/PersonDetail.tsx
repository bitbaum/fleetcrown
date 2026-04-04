"use client";

import { useEffect, useState } from "react";
import { X, MessageCircle, Link2 } from "lucide-react";
import { CHANNEL_CONFIG } from "@/config/channels";

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
                    <span className="text-white/40 font-mono text-xs truncate">{value}</span>
                  </div>
                ))}
            </Section>

            {/* Attributes */}
            <Section title="Details">
              {Object.entries(data.attrs)
                .filter(([k]) => !k.startsWith("channel:") && k !== "aliases")
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 text-sm">
                    <span className="text-white/50">{key}</span>
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

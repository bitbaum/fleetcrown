"use client";

import { useState } from "react";
import type { PersonWithAttributes } from "@/db/queries/people";
import { CHANNEL_CONFIG, CHANNEL_NAMES, isChannelAttrKey } from "@/config/channels";
import { HEALTH_DOT_COLOR } from "@/lib/utils";
import { Link2, Plus, Check, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { FIELD_INPUT_CLASS_COMPACT, FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";

export function PersonCard({
  person,
  onClick,
  onLogged,
}: {
  person: PersonWithAttributes;
  onClick: () => void;
  /** Called immediately after a successful interaction log so the grid can update local state */
  onLogged?: (personId: string, at: Date) => void;
}) {
  const channels = Object.keys(person.attrs).filter(isChannelAttrKey);
  const profession = person.attrs["profession"] ?? person.attrs["role"];
  const location = person.attrs["location"] ?? person.attrs["home_location"];

  const [logOpen, setLogOpen] = useState(false);
  const [channel, setChannel] = useState(CHANNEL_NAMES[0] ?? "whatsapp");
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submitLog(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    setSaving(true);
    const occurredAt = new Date();
    try {
      await fetch(`/api/people/${person.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, direction, summary: summary.trim() || undefined }),
      });
      setDone(true);
      setSummary("");
      // Update grid state immediately so the card reflects the new timestamp without a full refresh
      onLogged?.(person.id, occurredAt);
      setTimeout(() => {
        setDone(false);
        setLogOpen(false);
      }, 1200);
    } finally {
      setSaving(false);
    }
  }

  function openLog(e: React.MouseEvent) {
    e.stopPropagation();
    setLogOpen(true);
  }

  function cancelLog(e: React.MouseEvent) {
    e.stopPropagation();
    setLogOpen(false);
    setSummary("");
    setDone(false);
  }

  return (
    <div className="group w-full rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
      {/* Main clickable area */}
      <button onClick={onClick} className="w-full text-left p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${HEALTH_DOT_COLOR[person.health]}`}
              title={`${person.health}${person.lastInteraction ? ` — last ${formatDistanceToNow(person.lastInteraction, { addSuffix: true })}` : ""}`}
            />
            <div className="min-w-0">
              <div className="text-sm md:text-base font-medium truncate">{person.name}</div>
              {(profession || location) && (
                <div className="text-xs md:text-sm text-white/40 truncate mt-0.5">
                  {[profession, location].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="text-xs text-white/30 mt-0.5 flex items-center gap-1.5">
                {person.lastInteraction && (
                  <span>
                    {formatDistanceToNow(person.lastInteraction, { addSuffix: true })}
                    {person.interactionCount > 0 && ` · ${person.interactionCount} msgs`}
                  </span>
                )}
                {person.relationCount > 0 && (
                  <span className="flex items-center gap-0.5 text-purple-400/60">
                    <Link2 className="h-3 w-3" />
                    {person.relationCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {channels.map((ch) => {
              const config = CHANNEL_CONFIG[ch];
              if (!config) return null;
              const Icon = config.icon;
              return (
                <span key={ch} title={config.label}>
                  <Icon className={`h-4 w-4 md:h-5 md:w-5 ${config.color}`} />
                </span>
              );
            })}
          </div>
        </div>
      </button>

      {/* Quick-log button — always visible on mobile (no hover), revealed on hover for desktop */}
      {!logOpen && (
        <div className="px-3 pb-2 md:px-4 flex justify-end">
          <button
            onClick={openLog}
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white/25 hover:text-emerald-400 hover:bg-white/[0.04]"
            title="Log interaction"
          >
            <Plus className="h-3 w-3" /> Log
          </button>
        </div>
      )}

      {/* Inline log form */}
      {logOpen && (
        <div
          className="px-3 pb-3 md:px-4 md:pb-4 border-t border-white/[0.05] mt-0 pt-2.5 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          {done ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Logged
            </div>
          ) : (
            <>
              <div className="flex gap-2 items-center flex-wrap">
                {/* Channel selector */}
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className={FIELD_INPUT_CLASS_TIGHT}
                >
                  {CHANNEL_NAMES.map((ch) => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
                {/* Direction toggle */}
                <div className="flex rounded overflow-hidden border border-white/10 text-xs">
                  {(["outbound", "inbound"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={(e) => { e.stopPropagation(); setDirection(d); }}
                      className={`px-2.5 py-1 transition-colors ${
                        direction === d
                          ? "bg-white/15 text-white/80"
                          : "text-white/30 hover:text-white/50"
                      }`}
                    >
                      {d === "outbound" ? "out" : "in"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitLog(e);
                  if (e.key === "Escape") { e.stopPropagation(); setLogOpen(false); setSummary(""); }
                }}
                placeholder="Optional note..."
                autoFocus
                className={`w-full ${FIELD_INPUT_CLASS_COMPACT}`}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitLog}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-medium transition-colors"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Log
                </button>
                <button
                  onClick={cancelLog}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

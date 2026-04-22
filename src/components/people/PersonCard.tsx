import type { PersonWithAttributes } from "@/db/queries/people";
import { CHANNEL_CONFIG } from "@/config/channels";
import { Link2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const HEALTH_COLORS = {
  active: "bg-green-400",
  fading: "bg-yellow-400",
  stale: "bg-red-400",
  unknown: "bg-white/20",
} as const;

export function PersonCard({
  person,
  onClick,
}: {
  person: PersonWithAttributes;
  onClick: () => void;
}) {
  const channels = Object.keys(person.attrs).filter((k) => k.startsWith("channel:"));
  const profession = person.attrs["profession"] ?? person.attrs["role"];
  const location = person.attrs["location"] ?? person.attrs["home_location"];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-3 md:p-4 hover:bg-white/[0.06] transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${HEALTH_COLORS[person.health]}`}
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
  );
}

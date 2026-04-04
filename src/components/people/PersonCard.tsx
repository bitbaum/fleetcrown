import type { PersonWithAttributes } from "@/db/queries/people";
import { CHANNEL_CONFIG } from "@/config/channels";

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
      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{person.name}</div>
          {(profession || location) && (
            <div className="text-xs text-white/40 truncate mt-0.5">
              {[profession, location].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {channels.map((ch) => {
            const config = CHANNEL_CONFIG[ch];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <span key={ch} title={config.label}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

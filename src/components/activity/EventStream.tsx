import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DigestTimelineItem } from "@/db/queries/digests";
import { STATUS_DOT_CLASS, formatActivityTime, type Density } from "./activity-shared";

// Time-sorted unified stream of prompts and runs. Compact mode hides body
// text; Detailed mode shows it. Errors always show their body regardless of
// density — the error message is the thing the user has to act on.
export function EventStream({
  items,
  density,
}: {
  items: DigestTimelineItem[];
  density: Density;
}) {
  return (
    <Card className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Events</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Raw, time-sorted. Prompts you dispatched and runs that finished.
        </p>
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          const showBody = item.body && (density === "detailed" || item.status === "negative");
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-overlay"
            >
              <span
                className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS[item.status])}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-xs text-text-muted tabular-nums">
                    {formatActivityTime(item.occurredAt)}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{item.projectKey}</span>
                  <span
                    className={cn(
                      "text-sm",
                      item.status === "negative" ? "text-status-negative" : "text-text-secondary",
                    )}
                  >
                    {item.title}
                  </span>
                </div>
                {showBody && (
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-relaxed",
                      item.status === "negative" ? "text-status-negative/90" : "text-text-muted",
                      density === "compact" ? "line-clamp-2" : "",
                    )}
                  >
                    {item.body}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

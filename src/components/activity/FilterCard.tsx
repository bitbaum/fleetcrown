import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DIGEST_WINDOWS, type DigestWindow } from "@/db/queries/digests";
import type { ActivityFilter } from "@/lib/activity-events";
import { WINDOW_LABEL, activityHref, formatActivityTime } from "./activity-shared";

// The time window, and what it means in real dates. Range is inlined ("since
// 8. Juni, 22:38") so the user doesn't have to count days backward to know what
// the picker means. Outcome filtering lives on the feed itself, next to the
// counts that provoke it.
export function FilterCard({
  digestWindow,
  projectKey,
  filter,
  since,
}: {
  digestWindow: DigestWindow;
  projectKey: string | null;
  filter: ActivityFilter;
  since: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="ui-kicker">Last</span>
        <div className="flex flex-wrap gap-1.5">
          {DIGEST_WINDOWS.map((w) => (
            <Link
              key={w}
              href={activityHref({ window: w, project: projectKey, filter })}
              className={cn("ui-chip-filter", digestWindow === w && "ui-chip-filter-active")}
            >
              {WINDOW_LABEL[w]}
            </Link>
          ))}
        </div>
        <span className="text-xs text-text-tertiary">since {formatActivityTime(since)}</span>
      </div>
    </Card>
  );
}

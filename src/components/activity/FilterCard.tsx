import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DIGEST_WINDOWS, type DigestWindow } from "@/db/queries/digests";
import {
  DENSITIES,
  WINDOW_LABEL,
  activityHref,
  formatActivityTime,
  type Density,
} from "./activity-shared";

// One row: window picker on the left, density toggle on the right. Range is
// inlined ("since 8. Juni, 22:38") so the user doesn't have to count days
// backward to know what the picker means.
export function FilterCard({
  digestWindow,
  projectKey,
  density,
  since,
}: {
  digestWindow: DigestWindow;
  projectKey: string | null;
  density: Density;
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
              href={activityHref({ window: w, project: projectKey, density })}
              className={cn("ui-chip-filter", digestWindow === w && "ui-chip-filter-active")}
            >
              {WINDOW_LABEL[w]}
            </Link>
          ))}
        </div>
        <span className="text-xs text-text-tertiary">since {formatActivityTime(since)}</span>

        <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="ui-kicker">Density</span>
          {DENSITIES.map((d) => (
            <Link
              key={d}
              href={activityHref({ window: digestWindow, project: projectKey, density: d })}
              className={cn("ui-chip-filter capitalize", density === d && "ui-chip-filter-active")}
            >
              {d}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

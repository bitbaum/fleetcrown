import { Brain, Database, Link2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getEntityStats } from "@/db/queries/memory";
import { requirePageUserId } from "@/lib/session";
import { formatCount } from "@/lib/format";
import Link from "next/link";

export async function MemorySummaryCard() {
  const userId = await requirePageUserId();
  const stats = await getEntityStats(userId);

  return (
    <Card>
      <CardHeader
        icon={Brain}
        title="Memory"
        right={
          <Link href="/memory" className="ui-link-muted">
            View details →
          </Link>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="flex items-center gap-1.5 ui-micro-label mb-1">
            <Database className="h-3 w-3" /> Entities
          </div>
          <div className="text-2xl font-bold">{formatCount(stats.totalEntities)}</div>
          <div className="text-xs text-text-tertiary mt-0.5">{stats.entityTypes.length} types</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 ui-micro-label mb-1">
            <Link2 className="h-3 w-3" /> Relations
          </div>
          <div className="text-2xl font-bold">{formatCount(stats.totalRelations)}</div>
        </div>
        <div className="space-y-1.5 pt-0.5">
          {stats.entityTypes.slice(0, 4).map((row) => (
            <div key={row.type} className="flex items-center justify-between gap-2">
              <span className="text-micro text-text-tertiary capitalize">{row.type}</span>
              <span className="text-micro text-text-tertiary font-mono">{formatCount(row.count)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

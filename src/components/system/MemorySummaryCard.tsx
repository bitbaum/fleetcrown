import { Brain, Database, Link2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getEntityStats } from "@/db/queries/memory";
import Link from "next/link";

export async function MemorySummaryCard() {
  const stats = await getEntityStats();

  return (
    <Card>
      <CardHeader
        icon={Brain}
        title="Memory"
        right={
          <Link href="/memory" className="text-xs text-white/25 hover:text-white/55 transition-colors">
            View details →
          </Link>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-1">
            <Database className="h-3 w-3" /> Entities
          </div>
          <div className="text-2xl font-bold">{stats.totalEntities.toLocaleString()}</div>
          <div className="text-xs text-white/30 mt-0.5">{stats.entityTypes.length} types</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-1">
            <Link2 className="h-3 w-3" /> Relations
          </div>
          <div className="text-2xl font-bold">{stats.totalRelations.toLocaleString()}</div>
        </div>
        <div className="space-y-1.5 pt-0.5">
          {stats.entityTypes.slice(0, 4).map((row) => {
            const pct = Math.round((Number(row.count) / stats.totalEntities) * 100);
            return (
              <div key={row.type} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-white/35 capitalize">{row.type}</span>
                <span className="text-[10px] text-white/25 font-mono">{Number(row.count).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

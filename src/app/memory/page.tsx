import { Brain, Database, Link2, Clock, Zap } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getEntityStats, getRecentEntities, getRecentInteractions } from "@/db/queries/memory";
import { compactRelativeDate } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";

const TYPE_COLOR: Record<string, string> = {
  person:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  project:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  goal:        "bg-violet-500/10 text-violet-400 border-violet-500/20",
  company:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
  tool:        "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  concept:     "bg-pink-500/10 text-pink-400 border-pink-500/20",
  event:       "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLOR[type] ?? "bg-white/5 text-white/30 border-white/10";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {type}
    </span>
  );
}

export default async function MemoryPage() {
  const [stats, recent, activity] = await Promise.all([
    getEntityStats(),
    getRecentEntities(12),
    getRecentInteractions(10),
  ]);

  return (
    <PageLayout title="Memory" subtitle="What Ivy knows — the knowledge graph">

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader icon={Database} title="Entities" />
          <div className="text-2xl font-bold">{stats.totalEntities.toLocaleString()}</div>
        </Card>
        <Card>
          <CardHeader icon={Link2} title="Relations" />
          <div className="text-2xl font-bold">{stats.totalRelations.toLocaleString()}</div>
        </Card>
        <Card>
          <CardHeader icon={Brain} title="Types" />
          <div className="text-2xl font-bold">{stats.entityTypes.length}</div>
        </Card>
      </div>

      {/* Recent activity + recent additions side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recently added entities */}
        <Card>
          <CardHeader icon={Zap} title="Recently Added" />
          {recent.length === 0 ? (
            <EmptyState>Nothing added yet</EmptyState>
          ) : (
            <div className="space-y-2">
              {recent.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5">
                  <TypeBadge type={e.type} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{e.name}</div>
                    {e.description && (
                      <div className="text-xs text-white/30 truncate mt-0.5">{e.description}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-white/25 shrink-0 pt-0.5">
                    {compactRelativeDate(e.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent interactions */}
        <Card>
          <CardHeader icon={Clock} title="Recent Activity" />
          {activity.length === 0 ? (
            <EmptyState>No interactions logged yet</EmptyState>
          ) : (
            <div className="space-y-2">
              {activity.map((ix) => (
                <div key={ix.id} className="flex items-start gap-2.5">
                  <span className={`text-xs mt-0.5 shrink-0 ${ix.direction === "inbound" ? "text-blue-400/60" : "text-emerald-400/60"}`}>
                    {ix.direction === "inbound" ? "←" : "→"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate">{ix.entityName}</span>
                      <span className="text-[10px] text-white/25">{ix.channel}</span>
                    </div>
                    {ix.summary && (
                      <div className="text-xs text-white/30 truncate mt-0.5">{ix.summary}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-white/25 shrink-0 pt-0.5">
                    {compactRelativeDate(ix.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Entity distribution */}
      <Card>
        <CardHeader icon={Database} title="Entity Distribution" />
        <div className="space-y-3">
          {stats.entityTypes.map((row) => {
            const pct = Math.round((Number(row.count) / stats.totalEntities) * 100);
            return (
              <div key={row.type}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <TypeBadge type={row.type} />
                    <span className="font-medium">{row.type}</span>
                  </div>
                  <span className="text-white/40">{Number(row.count).toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/20 rounded-full"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </PageLayout>
  );
}

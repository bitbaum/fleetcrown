import { Brain, Database, Link2 } from "lucide-react";
import { getEntityStats } from "@/db/queries/memory";

export default async function MemoryPage() {
  const stats = await getEntityStats();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
        <p className="text-sm text-white/40 mt-1">What Ivy knows — the knowledge graph</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-white/50" />
            <span className="text-xs text-white/40 uppercase tracking-wider">Entities</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalEntities}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-4 w-4 text-white/50" />
            <span className="text-xs text-white/40 uppercase tracking-wider">Relations</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalRelations}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-white/50" />
            <span className="text-xs text-white/40 uppercase tracking-wider">Types</span>
          </div>
          <div className="text-2xl font-bold">{stats.entityTypes.length}</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-white/70 mb-4">Entity Distribution</h2>
        <div className="space-y-3">
          {stats.entityTypes.map((row) => {
            const pct = Math.round((Number(row.count) / stats.totalEntities) * 100);
            return (
              <div key={row.type}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{row.type}</span>
                  <span className="text-white/40">{row.count}</span>
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
      </div>
    </div>
  );
}

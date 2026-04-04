import { Brain, Database, Link2 } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getEntityStats } from "@/db/queries/memory";

export default async function MemoryPage() {
  const stats = await getEntityStats();

  return (
    <PageLayout title="Memory" subtitle="What Ivy knows — the knowledge graph">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader icon={Database} title="Entities" />
          <div className="text-2xl font-bold">{stats.totalEntities}</div>
        </Card>
        <Card>
          <CardHeader icon={Link2} title="Relations" />
          <div className="text-2xl font-bold">{stats.totalRelations}</div>
        </Card>
        <Card>
          <CardHeader icon={Brain} title="Types" />
          <div className="text-2xl font-bold">{stats.entityTypes.length}</div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={Database} title="Entity Distribution" />
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
      </Card>
    </PageLayout>
  );
}

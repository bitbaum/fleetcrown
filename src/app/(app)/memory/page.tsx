import { Brain, Database, Link2, Clock, Zap } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getEntityStats, getRecentEntities, getRecentInteractions } from "@/db/queries/memory";
import { getCurrentUserId } from "@/lib/session";
import { compactRelativeDate } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { ENTITY_TYPE, INTERACTION_DIRECTION, type EntityType } from "@/lib/constants/statuses";
import { ProgressBar } from "@/components/ui/progress-bar";

export const metadata = { title: "Memory" };

// Record<EntityType,…> makes TS fail the build if a new ENTITY_TYPE
// member is added without a colour here — no silent fallback.
// All entity types use the same monochrome accent badge — this app is intentionally achromatic.
const TYPE_COLOR: Record<EntityType, string> = {
  [ENTITY_TYPE.PERSON]:  "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.PROJECT]: "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.GOAL]:    "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.COMPANY]: "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.TOOL]:    "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.CONCEPT]: "bg-accent-muted text-accent-text border-accent-primary/20",
  [ENTITY_TYPE.EVENT]:   "bg-accent-muted text-accent-text border-accent-primary/20",
};

function TypeBadge({ type }: { type: EntityType }) {
  const cls = TYPE_COLOR[type] ?? "bg-surface-overlay text-text-tertiary border-border-subtle";
  return (
    <span className={`ui-tag ${cls}`}>
      {type}
    </span>
  );
}

export default async function MemoryPage() {
  const userId = await getCurrentUserId();
  const [stats, recent, activity] = await Promise.all([
    getEntityStats(userId),
    getRecentEntities(userId, 12),
    getRecentInteractions(userId, 10),
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
                    <div className="text-base truncate text-text-primary">{e.name}</div>
                    {e.description && (
                      <div className="mt-1 truncate text-sm text-text-secondary">{e.description}</div>
                    )}
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs text-text-tertiary">
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
                  <span className={`text-xs mt-0.5 shrink-0 ${ix.direction === INTERACTION_DIRECTION.INBOUND ? "text-text-muted" : "text-status-positive/60"}`}>
                    {ix.direction === INTERACTION_DIRECTION.INBOUND ? "←" : "→"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base truncate text-text-primary">{ix.entityName}</span>
                      <span className="text-xs text-text-tertiary">{ix.channel}</span>
                    </div>
                    {ix.summary && (
                      <div className="mt-1 truncate text-sm text-text-secondary">{ix.summary}</div>
                    )}
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs text-text-tertiary">
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
                  <span className="text-text-secondary">{Number(row.count).toLocaleString()}</span>
                </div>
                <ProgressBar value={pct} minPercent={1} tone="accent" className="h-2" />
              </div>
            );
          })}
        </div>
      </Card>
    </PageLayout>
  );
}

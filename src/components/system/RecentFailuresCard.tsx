import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getRecentDebugLogs } from "@/db/queries/debug-logs";
import { compactRelativeDate } from "@/lib/dates";

/**
 * Surfaces the last ~10 debug_logs rows on /system so the user can see live
 * telemetry without querying the DB manually. Sources currently emitting:
 *   - api/inject               (unknown tab, route-level 401, exec failure)
 *   - api/orchestration/run    (claude/codex/gemini inject + openclaw worker)
 *   - api/control/dispatch     (Groq fallback)
 *   - api/crons/prune-debug-logs (daily janitor heartbeat)
 *   - auth                     (Auth.js signIn errors and org-bootstrap fails)
 *
 * Server-component reads — no client poll, no fetch — re-renders whenever
 * the page revalidates (PullToRefresh or RefreshOnFocus).
 */

const LEVEL_TONE: Record<string, { icon: typeof Info; cls: string }> = {
  error: { icon: AlertCircle,   cls: "text-status-negative" },
  warn:  { icon: AlertTriangle, cls: "text-status-warning" },
  info:  { icon: Info,          cls: "text-text-tertiary" },
};

export async function RecentFailuresCard() {
  const rows = await getRecentDebugLogs(10).catch(() => []);
  const errorCount = rows.filter((r) => r.level === "error").length;

  return (
    <Card>
      <CardHeader
        icon={AlertCircle}
        title="Recent telemetry"
        right={
          errorCount > 0
            ? <span className="text-xs font-medium text-status-negative">{errorCount} error{errorCount === 1 ? "" : "s"}</span>
            : <span className="text-xs text-text-tertiary">all clear</span>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>No recent telemetry events</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const tone = LEVEL_TONE[row.level] ?? LEVEL_TONE.info;
            const Icon = tone.icon;
            return (
              <li key={row.id} className="flex items-start gap-2 text-xs">
                <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${tone.cls}`} />
                <span className="shrink-0 font-mono text-text-tertiary">
                  {compactRelativeDate(row.createdAt)}
                </span>
                <span className="shrink-0 text-text-muted">{row.source}</span>
                <span className="min-w-0 flex-1 truncate text-text-secondary" title={row.message}>
                  {row.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

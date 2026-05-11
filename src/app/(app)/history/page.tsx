import { History } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { getCurrentUserId } from "@/lib/session";
import { getPromptHistory } from "@/db/queries/prompt-history";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";

export const metadata = { title: "History" };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(items: Awaited<ReturnType<typeof getPromptHistory>>) {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.dispatchedAt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }
  return groups;
}

export default async function HistoryPage() {
  const userId = await getCurrentUserId();
  const items = await getPromptHistory(userId, 200);
  const byDay = groupByDay(items);

  return (
    <PageLayout
      title="History"
      subtitle="Every prompt dispatched to your agents — newest first"
    >
      {items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-text-secondary">
            <History className="h-10 w-10 text-text-tertiary" />
            <div className="text-sm">No prompt history yet</div>
            <div className="text-xs text-text-tertiary text-center">
              Dispatch a prompt from the Control panel and it will appear here.
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([, dayItems]) => {
            const firstItem = dayItems[0];
            return (
              <div key={firstItem.id}>
                <p className="ui-kicker text-text-muted mb-2 ml-1">
                  {formatDate(firstItem.dispatchedAt)}
                </p>
                <div className="space-y-px">
                  {dayItems.map((item) => {
                    const label = item.intent === "custom"
                      ? null
                      : getIntentLabel(item.intent);
                    const adapterLabel = getAdapterLabel(item.adapter);

                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-raised transition-colors"
                      >
                        {/* Time */}
                        <span className="shrink-0 w-14 text-xs text-text-muted font-mono pt-0.5">
                          {formatTime(item.dispatchedAt)}
                        </span>

                        {/* Project */}
                        <span className="shrink-0 w-28 text-sm font-medium text-text-primary truncate pt-0.5">
                          {item.projectKey}
                        </span>

                        {/* Prompt / intent */}
                        <div className="flex-1 min-w-0">
                          {item.customPrompt ? (
                            <p className="text-sm text-text-secondary leading-snug">
                              {item.customPrompt}
                            </p>
                          ) : (
                            <p className="text-sm text-text-tertiary italic">
                              {label ?? item.intent.replace(/_/g, " ")}
                            </p>
                          )}
                        </div>

                        {/* Adapter badge */}
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                          {adapterLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {items.length >= 200 && (
            <p className="text-xs text-text-muted text-center">Showing last 200 dispatches</p>
          )}
        </div>
      )}
    </PageLayout>
  );
}

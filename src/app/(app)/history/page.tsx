import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUserId } from "@/lib/session";
import { getPromptHistory } from "@/db/queries/prompt-history";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { ActivityShell } from "@/components/activity/ActivityShell";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const userId = await requirePageUserId();
  const items = await getPromptHistory(userId, 200);

  return (
    <ActivityShell active="history">
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="No prompt history yet">
            Dispatch a prompt from the Control panel and it will appear here.
          </EmptyState>
        </Card>
      ) : (
        <HistoryFeed items={items} />
      )}
    </ActivityShell>
  );
}

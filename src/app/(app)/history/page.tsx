import { History } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { getCurrentUserId } from "@/lib/session";
import { getPromptHistory } from "@/db/queries/prompt-history";
import { HistoryFeed } from "@/components/history/HistoryFeed";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const userId = await getCurrentUserId();
  const items = await getPromptHistory(userId, 200);

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
        <HistoryFeed items={items} />
      )}
    </PageLayout>
  );
}

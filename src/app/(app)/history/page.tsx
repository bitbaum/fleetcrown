import { History } from "lucide-react";
import Link from "next/link";
import { PageLayout } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUserId } from "@/lib/session";
import { getPromptHistory } from "@/db/queries/prompt-history";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { NAV } from "@/config/navigation";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const userId = await requirePageUserId();
  const items = await getPromptHistory(userId, 200);

  return (
    <PageLayout
      title="History"
      subtitle="Every prompt dispatched to your agents (orchestration events & runs feed the control surfaces too) — newest first"
      right={<Link href={NAV.digests.href} className="ui-btn-secondary">Read digests</Link>}
    >
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="No prompt history yet">
            Dispatch a prompt from the Control panel and it will appear here.
          </EmptyState>
        </Card>
      ) : (
        <HistoryFeed items={items} />
      )}
    </PageLayout>
  );
}

import { CheckCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getActiveCommitments } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";
import { CommitmentItem } from "./CommitmentItem";
import { AddCommitmentButton } from "./AddCommitmentButton";

export async function CommitmentsCard() {
  const userId = await getCurrentUserId();
  const items = await getActiveCommitments(userId);

  return (
    <div id="commitments">
    <Card>
      <CardHeader
        icon={CheckCircle}
        title="Commitments"
        right={<span className="text-xs md:text-sm text-text-tertiary">{items.length} active</span>}
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <CheckCircle className="h-6 w-6 text-text-tertiary" />
          <div className="text-sm text-text-secondary">No active commitments</div>
          <div className="text-xs text-text-tertiary">Use the button below to track things you&apos;ve promised</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <CommitmentItem
              key={item.id}
              id={item.id}
              description={item.description}
              dueDate={item.dueDate}
              financialImpact={item.financialImpact}
            />
          ))}
        </div>
      )}
      <AddCommitmentButton />
    </Card>
    </div>
  );
}

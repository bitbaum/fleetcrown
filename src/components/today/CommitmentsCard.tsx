import { CheckCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getActiveCommitments } from "@/db/queries/today";
import { CommitmentItem } from "./CommitmentItem";
import { AddCommitmentButton } from "./AddCommitmentButton";

export async function CommitmentsCard() {
  const items = await getActiveCommitments();

  return (
    <Card>
      <CardHeader
        icon={CheckCircle}
        title="Commitments"
        right={<span className="text-xs md:text-sm text-white/30">{items.length} active</span>}
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <CheckCircle className="h-6 w-6 text-white/15" />
          <div className="text-sm text-white/30">No active commitments</div>
          <div className="text-xs text-white/20">Use the button below to track things you&apos;ve promised</div>
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
  );
}

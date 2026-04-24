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
        <div className="text-sm md:text-base text-white/30">No active commitments</div>
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

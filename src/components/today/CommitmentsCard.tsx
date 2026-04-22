import { CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getActiveCommitments } from "@/db/queries/today";
import { formatDistanceToNow } from "date-fns";

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
          {items.map((item) => {
            const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();
            return (
              <div key={item.id} className="flex gap-3 items-start">
                {isOverdue ? (
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-white/20 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-sm md:text-base truncate">{item.description}</div>
                  {item.dueDate && (
                    <div className={`text-xs md:text-sm ${isOverdue ? "text-red-400" : "text-white/40"}`}>
                      {isOverdue ? "Overdue" : "Due"}{" "}
                      {formatDistanceToNow(new Date(item.dueDate), { addSuffix: true })}
                    </div>
                  )}
                  {item.financialImpact && (
                    <div className="text-xs md:text-sm text-amber-400/70">{item.financialImpact}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

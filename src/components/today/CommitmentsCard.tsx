import { CheckCircle, AlertCircle } from "lucide-react";
import { getActiveCommitments } from "@/db/queries/today";
import { formatDistanceToNow } from "date-fns";

export async function CommitmentsCard() {
  const items = await getActiveCommitments();

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-medium text-white/70">Commitments</h3>
        <span className="ml-auto text-xs text-white/30">{items.length} active</span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-white/30">No active commitments</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();
            return (
              <div key={item.id} className="flex gap-3 items-start">
                {isOverdue ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-sm truncate">{item.description}</div>
                  {item.dueDate && (
                    <div className={`text-xs ${isOverdue ? "text-red-400" : "text-white/40"}`}>
                      {isOverdue ? "Overdue" : "Due"}{" "}
                      {formatDistanceToNow(new Date(item.dueDate), { addSuffix: true })}
                    </div>
                  )}
                  {item.financialImpact && (
                    <div className="text-xs text-amber-400/70">{item.financialImpact}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

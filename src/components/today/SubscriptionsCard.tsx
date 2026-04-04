import { CreditCard } from "lucide-react";
import { getUpcomingSubscriptions } from "@/db/queries/today";
import { format } from "date-fns";

export async function SubscriptionsCard() {
  const items = await getUpcomingSubscriptions(14);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-medium text-white/70">Upcoming Bills</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-white/30">No bills due soon</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm">{item.name}</div>
                <div className="text-xs text-white/40">
                  {item.vendor}{item.nextDue ? ` · ${format(new Date(item.nextDue), "d MMM")}` : ""}
                </div>
              </div>
              <div className="text-sm font-mono text-white/70">
                {item.amount} {item.currency}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

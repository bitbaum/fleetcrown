import { CreditCard } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getUpcomingSubscriptions } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";
import { format } from "date-fns";

export async function SubscriptionsCard() {
  const userId = await getCurrentUserId();
  const items = await getUpcomingSubscriptions(userId);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader icon={CreditCard} title="Upcoming Bills" />
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <div>
              <div className="text-sm md:text-base">{item.name}</div>
              <div className="text-xs md:text-sm text-text-tertiary">
                {item.vendor}{item.nextDue ? ` · ${format(new Date(item.nextDue), "d MMM")}` : ""}
              </div>
            </div>
            <div className="text-sm md:text-base font-mono text-text-secondary">
              {item.amount} {item.currency}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

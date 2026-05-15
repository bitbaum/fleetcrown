import { CreditCard } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getUpcomingSubscriptions } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";
import { format, startOfDay } from "date-fns";

export async function SubscriptionsCard() {
  const userId = await getCurrentUserId();
  const items = await getUpcomingSubscriptions(userId);

  if (items.length === 0) return null;

  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader icon={CreditCard} title="Upcoming Bills" />
      <div className="space-y-2.5">
        {items.map((item) => {
          const overdue = !!item.nextDue && startOfDay(new Date(item.nextDue)) < today;
          return (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <div className={`text-sm md:text-base ${overdue ? "text-status-negative" : ""}`}>{item.name}</div>
                <div className={`text-xs md:text-sm ${overdue ? "text-status-negative/70" : "text-text-tertiary"}`}>
                  {item.vendor}{item.nextDue ? ` · ${format(new Date(item.nextDue), "d MMM")}` : ""}
                  {overdue && " · overdue"}
                </div>
              </div>
              <div className={`text-sm md:text-base font-mono ${overdue ? "text-status-negative" : "text-text-secondary"}`}>
                {item.amount} {item.currency}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

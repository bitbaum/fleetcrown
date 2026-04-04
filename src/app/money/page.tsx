import { CreditCard, AlertCircle } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import {
  getActiveSubscriptions,
  getFinancialCommitments,
  calculateMonthlyBurn,
} from "@/db/queries/money";
import { format, isPast } from "date-fns";

export default async function MoneyPage() {
  const subs = await getActiveSubscriptions();
  const commitments = await getFinancialCommitments();
  const burn = calculateMonthlyBurn(subs);

  return (
    <PageLayout title="Money" subtitle="Subscriptions, bills, and financial commitments">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Monthly Burn"
          value={`${burn.totalChf} CHF + ${burn.totalUsd} USD`}
          sub={`${burn.count} active subscriptions`}
        />
        <StatCard label="Subscriptions (CHF)" value={`${burn.totalChf} /mo`} sub="Swiss francs" />
        <StatCard label="Subscriptions (USD)" value={`${burn.totalUsd} /mo`} sub="US dollars" />
      </div>

      <Card>
        <CardHeader icon={CreditCard} title="Active Subscriptions" />
        {subs.length === 0 ? (
          <div className="text-sm text-white/30">No active subscriptions</div>
        ) : (
          <div className="space-y-3">
            {subs.map((sub) => {
              const isOverdue = sub.nextDue && isPast(new Date(sub.nextDue));
              return (
                <div key={sub.id} className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">{sub.name}</div>
                    <div className="text-xs text-white/40">
                      {sub.vendor}
                      {sub.paymentMethod ? ` · ${sub.paymentMethod}` : ""}
                      {sub.frequency !== "monthly" ? ` · ${sub.frequency}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono">{sub.amount} {sub.currency}</div>
                    {sub.nextDue && (
                      <div className={`text-xs ${isOverdue ? "text-red-400" : "text-white/40"}`}>
                        {isOverdue ? "Overdue" : "Due"} {format(new Date(sub.nextDue), "d MMM")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {commitments.length > 0 && (
        <Card>
          <CardHeader icon={AlertCircle} title="Financial Commitments" />
          <div className="space-y-2">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <div className="text-sm">{c.description}</div>
                <div className="text-sm font-mono text-amber-400/70">{c.financialImpact}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
  );
}

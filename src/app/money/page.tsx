import { CreditCard, TrendingDown, AlertCircle } from "lucide-react";
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
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Money</h1>
        <p className="text-sm text-white/40 mt-1">Subscriptions, bills, and financial commitments</p>
      </div>

      {/* Monthly burn summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Monthly Burn"
          value={`${burn.totalChf} CHF + ${burn.totalUsd} USD`}
          sub={`${burn.count} active subscriptions`}
        />
        <StatCard
          label="Subscriptions (CHF)"
          value={`${burn.totalChf} /mo`}
          sub="Swiss francs"
        />
        <StatCard
          label="Subscriptions (USD)"
          value={`${burn.totalUsd} /mo`}
          sub="US dollars"
        />
      </div>

      {/* Subscriptions list */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4 text-white/50" />
          <h2 className="text-sm font-medium text-white/70">Active Subscriptions</h2>
        </div>
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
                    <div className="text-sm font-mono">
                      {sub.amount} {sub.currency}
                    </div>
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
      </div>

      {/* Financial commitments */}
      {commitments.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-white/50" />
            <h2 className="text-sm font-medium text-white/70">Financial Commitments</h2>
          </div>
          <div className="space-y-2">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <div className="text-sm">{c.description}</div>
                <div className="text-sm font-mono text-amber-400/70">{c.financialImpact}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs text-white/40 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      <div className="text-xs text-white/30 mt-0.5">{sub}</div>
    </div>
  );
}

import { CreditCard, AlertCircle, HelpCircle, ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { SubscriptionActions } from "@/components/money/SubscriptionActions";
import { NewSubscriptionButton } from "@/components/money/NewSubscriptionButton";
import { SUBSCRIPTION_META } from "@/config/subscriptions";
import {
  getActiveSubscriptions,
  getAllSubscriptions,
  getFinancialCommitments,
  calculateMonthlyBurn,
} from "@/db/queries/money";
import { format, isPast, formatDistanceToNow } from "date-fns";

// Verify links now come from SUBSCRIPTION_META (config/subscriptions.ts)

const STATUS_STYLE: Record<string, string> = {
  active: "text-green-400 bg-green-400/10",
  unverified: "text-amber-400 bg-amber-400/10",
  cancelled: "text-white/30 bg-white/5",
};

export default async function MoneyPage() {
  const [activeSubs, allSubs, commitments] = await Promise.all([
    getActiveSubscriptions(),
    getAllSubscriptions(),
    getFinancialCommitments(),
  ]);
  const burn = calculateMonthlyBurn(activeSubs);

  return (
    <PageLayout title="Money" subtitle="Subscriptions, bills, and financial commitments" right={<NewSubscriptionButton />}>
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
        <CardHeader
          icon={CreditCard}
          title="All Subscriptions"
          right={
            <span className="text-xs text-white/20">
              Verified against email receipts Apr 2026
            </span>
          }
        />
        <div className="space-y-3">
          {allSubs.map((sub) => {
            const isOverdue = sub.nextDue && isPast(new Date(sub.nextDue));
            const verifyUrl = SUBSCRIPTION_META[sub.name]?.verifyUrl;
            const statusStyle = STATUS_STYLE[sub.status ?? "active"] ?? STATUS_STYLE.active;
            const isCancelled = sub.status === "cancelled";

            return (
              <div key={sub.id} className={`flex items-center justify-between py-1 ${isCancelled ? "opacity-40" : ""}`}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusStyle}`}>
                      {sub.status}
                    </span>
                    <span className={`text-sm md:text-base font-medium ${isCancelled ? "line-through" : ""}`}>{sub.name}</span>
                    {verifyUrl && (
                      <a
                        href={verifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white/20 hover:text-white/50 transition-colors"
                        title={`Verify at ${new URL(verifyUrl).hostname}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs md:text-sm text-white/40">
                    {sub.vendor}
                    {sub.paymentMethod ? ` · ${sub.paymentMethod}` : ""}
                    {sub.frequency !== "monthly" ? ` · ${sub.frequency}` : ""}
                  </div>
                  {sub.notes && (
                    <div className="text-xs text-white/25 mt-0.5 max-w-md">{sub.notes}</div>
                  )}
                  <SubscriptionActions subId={sub.id} subName={sub.name} status={sub.status} nextDue={sub.nextDue ? sub.nextDue.toISOString() : null} frequency={sub.frequency} amount={sub.amount} currency={sub.currency} notes={sub.notes} />
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-mono ${isCancelled ? "line-through" : ""}`}>
                    {sub.amount} {sub.currency}
                  </div>
                  {sub.nextDue && !isCancelled && (
                    <div className={`text-xs ${isOverdue ? "text-red-400" : "text-white/40"}`}>
                      {isOverdue ? "Overdue" : "Due"} {format(new Date(sub.nextDue), "d MMM")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-white/5 flex items-start gap-2 text-xs text-white/20">
          <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Click the arrow icon to verify at the source. Unverified = no billing email found. Ask Ivy to re-scan if something looks wrong.
          </span>
        </div>
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

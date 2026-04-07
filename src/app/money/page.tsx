import { CreditCard, AlertCircle, HelpCircle, ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import {
  getActiveSubscriptions,
  getFinancialCommitments,
  calculateMonthlyBurn,
} from "@/db/queries/money";
import { format, isPast, formatDistanceToNow } from "date-fns";

const VERIFY_LINKS: Record<string, string> = {
  "YouTube Premium": "https://www.youtube.com/paid_memberships",
  "Claude Max": "https://claude.ai/settings/billing",
  "ChatGPT Plus": "https://chat.openai.com/account/subscription",
  "Cursor Pro": "https://www.cursor.com/settings",
  "Salt Mobile": "https://www.salt.ch/en/my-account",
  "iCloud Storage": "https://www.icloud.com/settings/",
  "Google Cloud Platform": "https://console.cloud.google.com/billing",
};

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
        <CardHeader
          icon={CreditCard}
          title="Active Subscriptions"
          right={
            <span className="text-[10px] text-white/20">
              Source: knowledge.sqlite seed · verify links below
            </span>
          }
        />
        {subs.length === 0 ? (
          <div className="text-sm text-white/30">No active subscriptions</div>
        ) : (
          <div className="space-y-3">
            {subs.map((sub) => {
              const isOverdue = sub.nextDue && isPast(new Date(sub.nextDue));
              const verifyUrl = VERIFY_LINKS[sub.name];
              return (
                <div key={sub.id} className="flex items-center justify-between py-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{sub.name}</span>
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
                    <div className="text-xs text-white/40">
                      {sub.vendor}
                      {sub.paymentMethod ? ` · ${sub.paymentMethod}` : ""}
                      {sub.frequency !== "monthly" ? ` · ${sub.frequency}` : ""}
                    </div>
                    {sub.notes && (
                      <div className="text-[10px] text-white/25 mt-0.5">{sub.notes}</div>
                    )}
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
        <div className="mt-4 pt-3 border-t border-white/5 flex items-start gap-2 text-[10px] text-white/20">
          <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Data seeded from knowledge.sqlite. Click the arrow icon next to any subscription to verify at the source.
            If something is wrong, update it in Postgres directly or ask Ivy.
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

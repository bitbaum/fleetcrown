import { CreditCard, AlertCircle, HelpCircle, ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { StatRow } from "@/components/ui/stat-row";
import { SubscriptionActions } from "@/components/money/SubscriptionActions";
import { NewSubscriptionButton } from "@/components/money/NewSubscriptionButton";
import { CancelledSubsSection } from "@/components/money/CancelledSubsSection";
import { SUBSCRIPTION_META, FREQUENCY } from "@/config/subscriptions";
import { SUB_STATUS, type SubStatus } from "@/lib/constants/statuses";
import {
  getAllSubscriptions,
  getFinancialCommitments,
  calculateMonthlyBurn,
} from "@/db/queries/money";
import { requirePageUserId } from "@/lib/session";
import { format, isPast } from "date-fns";
import { formatMoney } from "@/lib/format";
import { ORANGECAT_INTEGRATION as INTEGRATION } from "@/config/marketing-content";

export const metadata = { title: "Money" };

const STATUS_STYLE: Record<SubStatus, string> = {
  [SUB_STATUS.ACTIVE]:     "text-status-positive bg-status-positive-subtle",
  [SUB_STATUS.UNVERIFIED]: "text-status-warning bg-status-warning-subtle",
  [SUB_STATUS.CANCELLED]:  "text-text-tertiary bg-surface-overlay",
};

function SubRow({ sub }: { sub: Awaited<ReturnType<typeof getAllSubscriptions>>[number] }) {
  const isOverdue = sub.nextDue && isPast(new Date(sub.nextDue));
  const verifyUrl = SUBSCRIPTION_META[sub.name]?.verifyUrl;
  const statusStyle = STATUS_STYLE[sub.status ?? SUB_STATUS.ACTIVE] ?? STATUS_STYLE[SUB_STATUS.ACTIVE];
  const isCancelled = sub.status === SUB_STATUS.CANCELLED;

  return (
    <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusStyle}`}>
            {sub.status}
          </span>
          <span className={`text-sm md:text-base font-medium ${isCancelled ? "line-through" : ""}`}>{sub.name}</span>
          {verifyUrl && (
            <a
              href={verifyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-11 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary sm:h-auto sm:w-auto"
              title={`Verify at ${new URL(verifyUrl).hostname}`}
              aria-label={`Verify ${sub.name} at ${new URL(verifyUrl).hostname}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {sub.orangecatServiceId && (
            <span
              className="text-micro px-1.5 py-0.5 rounded font-medium bg-status-positive/10 text-status-positive"
              title={`Synced to OrangeCat service ${sub.orangecatServiceId}`}
            >
              OC ✓
            </span>
          )}
        </div>
        <div className="text-sm text-text-secondary">
          {sub.vendor}
          {sub.paymentMethod ? ` · ${sub.paymentMethod}` : ""}
          {sub.frequency !== FREQUENCY.MONTHLY ? ` · ${sub.frequency}` : ""}
        </div>
        {sub.notes && (
          <div className="mt-1 max-w-md text-sm text-text-tertiary">{sub.notes}</div>
        )}
        <SubscriptionActions
          subId={sub.id}
          subName={sub.name}
          status={sub.status}
          nextDue={sub.nextDue ? sub.nextDue.toISOString() : null}
          frequency={sub.frequency}
          amount={sub.amount}
          currency={sub.currency}
          notes={sub.notes}
          paymentMethod={sub.paymentMethod}
          vendor={sub.vendor}
        />
      </div>
      <div className="shrink-0 sm:text-right">
        <div className={`text-base font-mono ${isCancelled ? "line-through" : ""}`}>
          {sub.amount != null ? `${sub.amount} ${sub.currency}` : <span className="text-text-tertiary">— {sub.currency}</span>}
        </div>
        {sub.nextDue && !isCancelled && (
          <div className={`text-sm ${isOverdue ? "text-status-negative" : "text-text-secondary"}`}>
            {isOverdue ? "Overdue" : "Due"} {format(new Date(sub.nextDue), "d MMM")}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function MoneyPage() {
  const userId = await requirePageUserId();

  // OrangeCat integration banner for FleetCrown (the customer) - SSOT in marketing-content
  const IntegrationBanner = (
    <div className="mb-4 rounded-lg border border-border-subtle bg-surface-raised p-3 text-sm">
      <div className="font-medium text-text-primary">Economic layer</div>
      <p className="mt-1 text-text-secondary">
        FleetCrown is a paying customer of OrangeCat via the <code>stakeholder_relationships</code> customer edge.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        <a href={INTEGRATION.orangeCat.profile} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center ui-link sm:min-h-0">
          {INTEGRATION.orangeCat.title} profile ({INTEGRATION.owner})
        </a>
        <a href={INTEGRATION.orangeCat.projectUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center ui-link sm:min-h-0">
          {INTEGRATION.orangeCat.title} project
        </a>
        <a href={INTEGRATION.fleetCrown.projectUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center ui-link sm:min-h-0">
          {INTEGRATION.fleetCrown.title} project
        </a>
      </div>
      <p className="mt-1 break-all text-text-tertiary">Shared wallet: <code>{INTEGRATION.wallet.btc}</code></p>
    </div>
  );

  const [allSubs, commitments] = await Promise.all([
    getAllSubscriptions(userId),
    getFinancialCommitments(userId),
  ]);
  const activeSubs = allSubs.filter((s) => s.status === SUB_STATUS.ACTIVE);
  const burn = calculateMonthlyBurn(activeSubs);
  const visibleSubs = allSubs.filter((s) => s.status !== SUB_STATUS.CANCELLED);
  const cancelledSubs = allSubs.filter((s) => s.status === SUB_STATUS.CANCELLED);
  const unverifiedCount = visibleSubs.filter((s) => s.status === SUB_STATUS.UNVERIFIED).length;

  return (
    <PageLayout title="Money" subtitle="Subscriptions, bills, and financial commitments" right={<NewSubscriptionButton />}>
      {IntegrationBanner}
      <StatRow>
        <StatCard
          label="Monthly Burn"
          value={[
            burn.totalChf > 0 ? formatMoney(burn.totalChf, "CHF") : null,
            burn.totalUsd > 0 ? formatMoney(burn.totalUsd, "USD") : null,
            burn.totalEur > 0 ? formatMoney(burn.totalEur, "EUR") : null,
            burn.totalGbp > 0 ? formatMoney(burn.totalGbp, "GBP") : null,
          ].filter(Boolean).join(" + ") || "—"}
          sub={`${burn.count} active subscriptions`}
        />
        <StatCard
          label="Unverified"
          value={String(unverifiedCount)}
          sub={unverifiedCount > 0 ? "need attention" : "all confirmed"}
        />
        <StatCard
          label="Non-CHF /mo"
          value={[
            burn.totalUsd > 0 ? formatMoney(burn.totalUsd, "USD") : null,
            burn.totalEur > 0 ? formatMoney(burn.totalEur, "EUR") : null,
            burn.totalGbp > 0 ? formatMoney(burn.totalGbp, "GBP") : null,
          ].filter(Boolean).join(", ") || "—"}
          sub="other currencies"
        />
      </StatRow>

      <Card>
        <CardHeader
          icon={CreditCard}
          title="Active Subscriptions"
          right={
            <span className="text-sm text-text-tertiary">
              Verified against email receipts
            </span>
          }
        />
        <div className="space-y-3">
          {visibleSubs.map((sub) => <SubRow key={sub.id} sub={sub} />)}
        </div>
        <CancelledSubsSection count={cancelledSubs.length}>
          {cancelledSubs.map((sub) => <SubRow key={sub.id} sub={sub} />)}
        </CancelledSubsSection>
        <div className="mt-5 flex items-start gap-2 border-t border-border-subtle pt-4 text-sm text-text-tertiary">
          <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Click the arrow icon to verify at the source. Unverified = no billing email found. Ask Loki to re-scan if something looks wrong.
          </span>
        </div>
      </Card>

      {commitments.length > 0 && (
        <Card>
          <CardHeader icon={AlertCircle} title="Financial Commitments" />
          <div className="space-y-2">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <div className="text-base text-text-primary">{c.description}</div>
                <div className="text-base font-mono text-status-warning">{c.financialImpact}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
  );
}

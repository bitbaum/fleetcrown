"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { postJson } from "@/lib/api/fetch";
import { PRICING_PLANS, PRICING_CURRENCY, PRICING_BILLING_NOTE } from "@/config/plans";
import type { Plan } from "@/db/schema/users";

const PLAN_LABEL: Record<Plan, string> = {
  free:     "Free",
  personal: "Personal",
  pro:      "Pro",
  team:     "Team",
};

type Props = {
  plan: Plan;
  planStatus: string | null;
  stripeReady: boolean;
  hasSubscription: boolean;
};

const BILLING_MESSAGES: Record<string, { text: string; type: "success" | "info" | "error" }> = {
  success:          { text: "Subscription activated — welcome to the plan!", type: "success" },
  canceled:         { text: "Checkout canceled — no charge was made.", type: "info" },
  error:            { text: "Something went wrong during checkout. Please try again.", type: "error" },
  "not-configured": { text: "Payment integration is not yet configured.", type: "info" },
  "already-active": { text: "You're already on this plan.", type: "info" },
};

export function BillingSettings({ plan, planStatus, stripeReady, hasSubscription }: Props) {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const pathname      = usePathname();
  const didProcess    = useRef(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  useEffect(() => {
    if (didProcess.current) return;
    const billingParam = searchParams.get("billing");
    if (!billingParam) return;
    didProcess.current = true;
    setNotice(BILLING_MESSAGES[billingParam] ?? null);
    // Remove the query param so a page refresh doesn't re-show it
    const params = new URLSearchParams(searchParams.toString());
    params.delete("billing");
    const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  async function handleUpgrade(targetPlan: "personal" | "pro" | "team") {
    setError("");
    setLoading(targetPlan);
    try {
      const res = await postJson("/api/stripe/checkout", { plan: targetPlan, billing: "annual" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start checkout."); return; }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  function handleManage() {
    window.location.href = "/api/stripe/portal";
  }

  return (
    <section className="ui-settings-section">
      {notice && (
        <p className={`rounded-lg px-4 py-3 text-sm ${
          notice.type === "success" ? "bg-status-positive/10 text-status-positive" :
          notice.type === "error"   ? "bg-status-negative/10 text-status-negative" :
          "bg-surface-raised text-text-secondary"
        }`}>
          {notice.text}
        </p>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium text-text-primary">Billing</h2>
          <p className="text-sm text-text-tertiary">
            Current plan: <span className="text-text-secondary font-medium">{PLAN_LABEL[plan]}</span>
            {planStatus === "past_due" && (
              <span className="ml-2 text-status-warning text-xs">· payment past due</span>
            )}
          </p>
        </div>
        {hasSubscription && stripeReady && (
          <button onClick={handleManage} className="ui-btn-secondary shrink-0 text-sm">
            Manage subscription
          </button>
        )}
      </div>

      {!stripeReady && (
        <p className="text-sm text-text-muted bg-surface-raised rounded-lg px-4 py-3">
          Payment integration is not yet configured. Add{" "}
          <code className="text-accent-text text-xs">STRIPE_SECRET_KEY</code> and price IDs to enable subscriptions.
        </p>
      )}

      {stripeReady && plan === "free" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Tiers with a null price are to-be-announced — not sellable yet. */}
            {PRICING_PLANS.filter((tier) => tier.key !== "free" && tier.priceMonthly !== null).map((tier) => {
              const tierPlan = tier.key as "personal" | "pro" | "team";
              return (
                <div
                  key={tier.key}
                  className={`ui-panel rounded-xl p-4 space-y-3 ${tier.featured ? "border-accent-primary/40" : ""}`}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">{tier.name}</p>
                    <p className="text-2xl font-bold text-text-primary mt-1">
                      {PRICING_CURRENCY} {tier.priceMonthly}<span className="text-sm font-normal text-text-tertiary">/mo</span>
                    </p>
                    <p className="text-xs text-text-tertiary">{tier.tagline}</p>
                  </div>
                  <button
                    onClick={() => handleUpgrade(tierPlan)}
                    disabled={!!loading}
                    className={tier.featured ? "ui-btn-primary w-full" : "ui-btn-secondary w-full"}
                  >
                    {loading === tierPlan ? "Redirecting…" : tier.cta}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">{PRICING_BILLING_NOTE}</p>
        </>
      )}

      {error && <p className="ui-error">{error}</p>}
    </section>
  );
}

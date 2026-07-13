/**
 * Manual plan grant — the Phase-0 OrangeCat-rail entitlement path.
 *
 * Until the OC→FC payment webhook exists (Phase 1), a FleetCrown tier bought in
 * Bitcoin through OrangeCat is granted by hand with this: confirm the BTC payment
 * settled on the OC side, then run this to flip `users.plan` — the SAME write the
 * Stripe webhook does (updateUserBilling), so the entitlement is identical
 * regardless of rail. Records the grant in debug_logs for an audit trail.
 *
 *   npx tsx scripts/grant-plan.ts <userId> <free|personal|pro|team> "<reason/oc-payment-ref>"
 *
 * Reversible: re-run with `free` to downgrade. Point DATABASE_URL at the target
 * (a prod tunnel for a live grant).
 */
import { getUserById, updateUserBilling } from "@/db/queries/users";
import { countActiveProjects } from "@/db/queries/user-projects";
import { getProjectLimit, isUnlimitedProjects } from "@/lib/plan";
import { logDebug } from "@/db/queries/debug-logs";
import { PLAN_VALUES, type Plan } from "@/db/schema/users";

function limitLabel(plan: Plan): string {
  return isUnlimitedProjects(plan) ? "Unlimited" : String(getProjectLimit(plan));
}

async function main() {
  const [userId, plan, reason] = process.argv.slice(2);
  if (!userId || !plan) {
    console.error('Usage: grant-plan.ts <userId> <free|personal|pro|team> "<reason>"');
    process.exit(2);
  }
  if (!(PLAN_VALUES as readonly string[]).includes(plan)) {
    console.error(`Invalid plan "${plan}". One of: ${PLAN_VALUES.join(", ")}`);
    process.exit(2);
  }

  const before = await getUserById(userId);
  if (!before) {
    console.error(`No user ${userId}`);
    process.exit(1);
  }
  const count = await countActiveProjects(userId).catch(() => 0);
  console.log(`user ${userId} (${before.email ?? "?"})`);
  console.log(`  BEFORE: plan=${before.plan} status=${before.planStatus ?? "—"} projectLimit=${limitLabel(before.plan)} (using ${count})`);

  const targetPlan = plan as Plan;
  const updated = await updateUserBilling(userId, {
    plan: targetPlan,
    planStatus: targetPlan === "free" ? "canceled" : "active",
  });
  if (!updated) {
    console.error("update failed");
    process.exit(1);
  }
  await logDebug({
    source: "manual-grant",
    level: "info",
    message: `plan ${before.plan} → ${targetPlan}`,
    meta: { userId, from: before.plan, to: targetPlan, reason: reason ?? null, rail: "orangecat-btc" },
  }).catch(() => {});

  console.log(`  AFTER:  plan=${updated.plan} status=${updated.planStatus} projectLimit=${limitLabel(updated.plan)}`);
  console.log(`  reason: ${reason ?? "(none)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

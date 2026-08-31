import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

// Owner-only: deletes every row in goals and replaces them with the owner's
// canonical hierarchy. Gate behind COCKPIT_OWNER_SEED=1 so it can't run
// against a multi-tenant deployment.
if (process.env.COCKPIT_OWNER_SEED !== "1") {
  console.error(
    "Refusing to run seed-goals.ts without COCKPIT_OWNER_SEED=1 (this wipes the goals table).",
  );
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL!;
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  // Clear existing goals
  await db.delete(schema.goals);

  // ═══════════════════════════════════════════════
  // TOP-LEVEL LIFE GOALS
  // ═══════════════════════════════════════════════

  const [godMode] = await db
    .insert(schema.goals)
    .values({
      userId: DEFAULT_USER_ID,
      title: "God Mode — AI that runs your life",
      description:
        "Build Ivy into a fully autonomous life OS. FleetCrown is the interface. Knowledge graph is the brain. Adapters are the senses. Then replicate it for others.",
      status: "active",
      progress: 15,
      milestones: [
        { title: "Knowledge graph in Postgres", done: true },
        { title: "FleetCrown v1 with 7 views", done: true },
        { title: "Seed 1,300+ entities from contacts + knowledge", done: true },
        { title: "Email integration (Today view)", done: false },
        { title: "Goal tracking with progress", done: true },
        { title: "Ask Ivy button functional", done: false },
        { title: "Interaction tracking (who you talked to, when)", done: false },
        { title: "Proactive alerts (overdue, stale relationships)", done: false },
        { title: "Set up FleetCrown for first other person", done: false },
      ],
    })
    .returning();

  const [financialFreedom] = await db
    .insert(schema.goals)
    .values({
      userId: DEFAULT_USER_ID,
      title: "Financial independence",
      description:
        "Enough passive/semi-passive income to never need a job. BTC + product revenue + consulting.",
      status: "active",
      progress: 10,
      milestones: [
        { title: "Track all subscriptions and burn rate", done: true },
        { title: "OrangeCat generating revenue", done: false },
        { title: "Kivvi first paying customer", done: false },
        { title: "Monthly income > monthly burn", done: false },
      ],
    })
    .returning();

  const [civilizationalStack] = await db
    .insert(schema.goals)
    .values({
      userId: DEFAULT_USER_ID,
      title: "Civilizational Stack",
      description:
        "Remove every bottleneck between humans and their full potential. AI inventing AI, robots building robots, humans freed from coerced labor. Stack builds bottom-up.",
      status: "active",
      progress: 20,
      milestones: [
        { title: "Layer 1: Hardware Access (RevampIT)", done: true },
        { title: "Layer 2: Value Exchange (OrangeCat)", done: false },
        { title: "Layer 3: Governance (Solon)", done: false },
        { title: "Layer 4: Automation (DataCat, Kivvi)", done: false },
        { title: "Layer 5: AI Services (Botsmann)", done: false },
        { title: "Layer 6: Intelligence (Hirnli)", done: false },
      ],
    })
    .returning();

  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    title: "Health & longevity",
    description:
      "Optimize body and mind. Swiss Longevity Hub connection. Psychedelics for growth. Exercise, sleep, nutrition.",
    status: "active",
    progress: 30,
  });

  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    title: "Relationships & community",
    description:
      "Maintain deep connections. Anja. Close friends. Zurich network. Don't let relationships decay through neglect.",
    status: "active",
    progress: 50,
    milestones: [
      { title: "Contact resolver with 1,278 people", done: true },
      { title: "People view in FleetCrown", done: true },
      { title: "Interaction tracking (last contact per person)", done: false },
      { title: "Relationship health alerts", done: false },
    ],
  });

  // ═══════════════════════════════════════════════
  // SUB-GOALS (linked to top-level)
  // ═══════════════════════════════════════════════

  // Under God Mode
  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: godMode.id,
    title: "FleetCrown Phase 2 — write operations + email",
    description:
      "Add create/edit for goals and commitments. Integrate email-intel.py into Today view. Make Ask Ivy functional.",
    status: "active",
    progress: 0,
  });

  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: godMode.id,
    title: "FleetCrown for others — productize",
    description:
      "Package FleetCrown as a self-hosted Docker app. Document setup. Find first beta user.",
    status: "active",
    progress: 0,
  });

  // Under Financial Freedom
  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: financialFreedom.id,
    title: "OrangeCat launch + first revenue",
    description: "Finish hardening branch. Launch properly. Get first paying users.",
    status: "active",
    progress: 40,
    milestones: [
      { title: "Hardening pass complete", done: false },
      { title: "Security audit score > 8/10", done: false },
      { title: "Public launch", done: false },
      { title: "First transaction", done: false },
    ],
  });

  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: financialFreedom.id,
    title: "Reduce monthly burn",
    description:
      "Audit subscriptions. Cancel what's not essential. Target: under 200 CHF/mo total.",
    status: "active",
    progress: 20,
  });

  // Under Civilizational Stack
  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: civilizationalStack.id,
    title: "Hirnli launch — Q2 2026",
    description:
      "Fundraising intelligence at hirn.li. Layer 6: Intelligence. Docs exist, no code yet.",
    status: "active",
    progress: 5,
    targetDate: new Date("2026-06-30"),
  });

  await db.insert(schema.goals).values({
    userId: DEFAULT_USER_ID,
    parentGoalId: civilizationalStack.id,
    title: "RevampIT security fix + CMS deploy",
    description:
      "Email verification bypass is a production vulnerability. CMS backend not deployed.",
    status: "active",
    progress: 70,
    milestones: [
      { title: "Fix email verification bypass", done: false },
      { title: "Deploy CMS backend", done: false },
    ],
  });

  console.log("Goals seeded:");
  console.log(`  5 top-level goals`);
  console.log(`  5 sub-goals`);
  console.log(`  10 total`);

  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

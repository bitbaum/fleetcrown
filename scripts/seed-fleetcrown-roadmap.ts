/**
 * Seed FleetCrown's OWN project profile so the autopilot dispatches against a
 * concrete roadmap instead of doing generic work.
 *
 * The dogfood gap (2026-06-19): the `fleetcrown` project entity had a marketing
 * placeholder description ("Local repository imported from …") and ZERO goals.
 * getProjectContext injects exactly the entity description (the brief) + active
 * goals (the roadmap) into every dispatch — so with neither, dispatched agents
 * got no real context.
 *
 * This script (idempotent, scoped to the fleetcrown entity):
 *   1. Sets an engineering-grade brief on the entity (architecture + conventions).
 *   2. Replaces the reliability/observability/context roadmap goals — each goal
 *      carries milestones that ARE the acceptance criteria.
 *
 * Re-running only touches goals tagged metadata.roadmap === ROADMAP_TAG, so any
 * manually-created goals on the project are left alone.
 *
 * Run:  FLEETCROWN_SEED_ROADMAP=1 DATABASE_URL=... npx tsx scripts/seed-fleetcrown-roadmap.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, ilike } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { Milestone } from "../src/db/schema/goals";
import { ENTITY_TYPE, GOAL_STATUS } from "../src/lib/constants/statuses";

if (process.env.FLEETCROWN_SEED_ROADMAP !== "1") {
  console.error("Refusing to run without FLEETCROWN_SEED_ROADMAP=1.");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const ROADMAP_TAG = "autopilot-reliability";

// Engineering-grade brief injected verbatim by getProjectContext (only used when
// it is prose, not a filesystem path — so this replaces the path-like placeholder).
const BRIEF = [
  "FleetCrown — multi-user SaaS to command AI agent fleets across projects (the platform's own dogfood customer).",
  "Stack: Next.js 16 (App Router, Server Components/Actions), TypeScript strict, Tailwind 4 + shadcn/ui (always dark, .dark on <html>), Drizzle ORM (schema is the SSOT for types via $inferSelect/$inferInsert), PostgreSQL 17. Self-hosted on a Hetzner box (systemd fleetcrown-app serving the Next standalone build behind Caddy) — NOT Vercel.",
  "Architecture: src/app = thin pages + API routes that delegate to src/db/queries (one file per domain) and components; src/db/schema = Drizzle tables (type SSOT); src/config = SSOT for navigation/channels/prompt-library; src/lib = orchestration contract, session, tools. home/ is the local-first orchestration library (watcher + worker tail one append-only JSONL event log).",
  "Execution (2026-06): The cloud builder is fleetcrown-box-runner.service on Hetzner — headless Fleet Runner core polling pending_commands and running agents in FleetCrown-owned node-pty PTYs. The web app is a control plane only (RUNTIME_AVAILABLE unset); Terminal → Cloud watches via peek-stream. Optional desktop Fleet Runner on the operator's computer shares the same queue.",
  "Loki is the primary command surface (NL composer, fleet fast paths, move-forward). Control is the nerve center for fleet state. Priority plan SSOT: docs/architecture/priority-plan-2026-H2.md.",
  "Design system: a strict 4-layer token pipeline — globals.css :root raw values -> @theme inline Tailwind mappings -> ui-* component classes -> JSX (structure + layout only). Never use palette colors, hex, or arbitrary type sizes in components.",
  "Conventions: first-principles + SSOT/DRY/SoC/KISS/YAGNI; getCurrentUserId() for user id; <Modal>/<Drawer> primitives; lib/dates.ts for dates; useInlineEdit/useCreateMutation hooks; every table has user_id (multi-user), UUID PKs, JSONB metadata. Deploy via scripts/deploy-hetzner.sh (build -> rsync -> restart -> verify) with push-to-deploy on main.",
].join("\n");

type GoalSeed = {
  title: string;
  description: string;
  progress: number;
  milestones: Milestone[];
};

// Ordered to match docs/architecture/priority-plan-2026-H2.md (Horizons A→B, defer i18n).
const GOALS: GoalSeed[] = [
  {
    title: "Finish zellij -> FleetCrown-owned PTY terminal migration",
    description:
      "Own the agent terminal instead of puppeting zellij tab names. Horizon A: Terminal Cloud watches box-runner peek; web app must not spawn PTYs on prod. Acceptance: agents launch and receive injects through owned node-pty PTYs; zellij is no longer required on the cloud path.",
    progress: 40,
    milestones: [
      { title: "Single transport-parameterized xterm view", done: true },
      { title: "node-pty owned-PTY executor on box-runner (cloud builder)", done: true },
      { title: "Terminal Cloud = peek stream (not generic bash workspaces)", done: true },
      { title: "Gate /api/workspaces on cloud control plane", done: true },
      { title: "Cut dispatch path from zellij name-puppeting to owned PTY", done: false },
      { title: "Remove zellij dependency from the launch flow", done: false },
    ],
  },
  {
    title: "One context assembler: Global+Project+Session into EVERY dispatch",
    description:
      "Every dispatch path must carry the same layered context from one assembler (Horizon B2). Acceptance: quick-send, autopilot, and inject-core all inject Global + Project + Session context; the inject-core bypass is closed.",
    progress: 40,
    milestones: [
      { title: "Global operating principles injected (Global tier)", done: true },
      { title: "Project brief + active goals injected via getProjectContext", done: true },
      { title: "Session handoff injected on every dispatch path", done: false },
      { title: "Close the /api/inject-core bypass (one assembler, all paths)", done: false },
    ],
  },
  {
    title: "Capture run outcomes (Done/Failed/commit), not just dispatches",
    description:
      "Record what each run actually did, not merely that it was dispatched (Horizon B3). Acceptance: every finished run persists an outcome + resulting commit SHA, queryable via the activity SSOT.",
    progress: 70,
    milestones: [
      { title: "Persist outcome (success/partial/error/hang/abort/timeout)", done: true },
      { title: "Capture resulting commit SHA per run", done: true },
      { title: "Build run summary from the SSOT field array (no dropped fields)", done: true },
      { title: "Surface outcomes in the activity timeline + analytics view", done: false },
    ],
  },
  {
    title: "Truthful-state chips on project cards",
    description:
      "A card must never claim success when the evidence (git, handoff) contradicts it (Horizon B4). Acceptance: contradictory state is always surfaced as a chip rather than trusted.",
    progress: 50,
    milestones: [
      { title: "'no commit' warning when a done run left no git trace", done: true },
      { title: "Stale-running / execution-stall chip", done: true },
      { title: "Surface block-reason / no-op-count as chips", done: false },
    ],
  },
  {
    title: "Runner stall: auto-recovery & alerting",
    description:
      "Execution-stall detection shipped (pushes alive but the command loop is hung). Close the loop: recover or alert, never silently stall (Horizon B5). Acceptance: a stalled runner is auto-recovered or the operator is alerted within one poll cycle.",
    progress: 35,
    milestones: [
      { title: "Detect execution-stall (pushes alive, command loop hung)", done: true },
      { title: "Auto-recover: re-dispatch / restart runner on stall", done: false },
      { title: "Alert operator (push / Telegram) when a stall is detected", done: false },
    ],
  },
  {
    title: "Deploy on origin/main + auto-migrate + rollback/alert",
    description:
      "Make shipping safe and hands-off (Horizon D3). Acceptance: pushing main runs DB migrations (ledger-based, never drizzle-kit push) and auto-rolls-back + alerts on a failed post-deploy health check.",
    progress: 45,
    milestones: [
      { title: "Push-to-deploy on main (pre-push backgrounds the deploy)", done: true },
      { title: "Post-deploy verification (sign-in / health / providers)", done: true },
      { title: "Auto-run drizzle migrate on deploy (ledger-based)", done: false },
      { title: "Auto-rollback + alert on failed verification", done: false },
    ],
  },
  {
    title: "i18n missing-key tooling + national-locale SLAs",
    description:
      "Deferred per priority plan — not blocking dogfood. Acceptance: missing i18n keys fail CI; per-locale completeness is reported against defined national-locale SLAs (de-CH first).",
    progress: 0,
    milestones: [
      { title: "Tooling / CI check that fails on missing translation keys", done: false },
      { title: "Per-locale completeness report", done: false },
      { title: "Define national-locale SLAs (de-CH first)", done: false },
    ],
  },
];

async function main() {
  const client = postgres(DATABASE_URL!);
  const db = drizzle(client, { schema });

  const [entity] = await db
    .select({ id: schema.entities.id, userId: schema.entities.userId, name: schema.entities.name })
    .from(schema.entities)
    .where(and(eq(schema.entities.type, ENTITY_TYPE.PROJECT), ilike(schema.entities.name, "fleetcrown")))
    .limit(1);

  if (!entity) {
    console.error("No project entity named 'fleetcrown' found — nothing to seed.");
    await client.end();
    process.exit(1);
  }

  // 1) Engineering-grade brief.
  await db
    .update(schema.entities)
    .set({ description: BRIEF })
    .where(eq(schema.entities.id, entity.id));
  console.log(`Updated brief for entity ${entity.name} (${entity.id}).`);

  // 2) Idempotent roadmap goals — remove only our previously-seeded ones.
  const existing = await db
    .select({ id: schema.goals.id, metadata: schema.goals.metadata })
    .from(schema.goals)
    .where(eq(schema.goals.entityId, entity.id));
  const ours = existing.filter(
    (g) => (g.metadata as Record<string, unknown> | null)?.roadmap === ROADMAP_TAG,
  );
  for (const g of ours) {
    await db.delete(schema.goals).where(eq(schema.goals.id, g.id));
  }
  console.log(`Cleared ${ours.length} previously-seeded roadmap goal(s).`);

  for (const g of GOALS) {
    await db.insert(schema.goals).values({
      userId: entity.userId,
      entityId: entity.id,
      title: g.title,
      description: g.description,
      status: GOAL_STATUS.ACTIVE,
      progress: g.progress,
      milestones: g.milestones,
      metadata: { roadmap: ROADMAP_TAG },
    });
  }
  console.log(`Seeded ${GOALS.length} roadmap goals for fleetcrown.`);

  await client.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

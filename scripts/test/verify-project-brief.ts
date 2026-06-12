// One-shot verification of the AI profile pipeline (lib/project-brief) against
// the local dev DB: picks the user's FleetCrown project, runs a real Groq
// extraction from a short brief, applies it, and reads the attrs back.
// Run: npx tsx scripts/test/verify-project-brief.ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../../src/db");
  const { entities, attributes } = await import("../../src/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { extractProjectProfile, applyProjectProfile } = await import("../../src/lib/project-brief");

  const [project] = await db
    .select({ id: entities.id, userId: entities.userId, name: entities.name, description: entities.description })
    .from(entities)
    .where(and(eq(entities.type, "project"), eq(entities.name, process.argv[2] ?? "fleetcrown")))
    .limit(1);
  if (!project) {
    const all = await db
      .select({ name: entities.name })
      .from(entities)
      .where(eq(entities.type, "project"));
    throw new Error(`project not found locally. Available: ${all.map((r) => r.name).join(", ")}`);
  }
  console.log("project:", project.name, project.id);

  const brief = `FleetCrown is a life operating system and AI agent fleet commander.
You sign in, register projects, press one play button and all your projects get
built by AI agents without supervision; the same button pauses everything.
It serves builders running many projects at once. Built with Next.js 16,
TypeScript, Tailwind 4, Drizzle, Postgres 17. Currently in production at
fleetcrown.vercel.app. Next step: make project profiles self-filling from
free-form text and repos so the fleet always has full context.`;

  const profile = await extractProjectProfile(project.name, brief);
  console.log("extracted:", JSON.stringify(profile, null, 2));

  const applied = await applyProjectProfile(project.userId, project.id, profile);
  if (!applied) throw new Error("applyProjectProfile returned null (ownership check failed)");
  console.log("applied keys:", Object.keys(applied).join(", "));

  const rows = await db
    .select({ key: attributes.key, value: attributes.value })
    .from(attributes)
    .where(eq(attributes.entityId, project.id));
  console.log("attrs now in DB:");
  for (const r of rows) console.log(`  ${r.key} = ${r.value.slice(0, 90)}`);
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

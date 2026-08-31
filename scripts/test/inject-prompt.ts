// Verify cloud-safe inject prompt assembly includes project context markers.
// Run: npx tsx scripts/test/inject-prompt.ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../../src/db");
  const { entities } = await import("../../src/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { assembleInjectPrompt } = await import("../../src/lib/inject-prompt");

  const [project] = await db
    .select({ id: entities.id, userId: entities.userId, name: entities.name })
    .from(entities)
    .where(and(eq(entities.type, "project"), eq(entities.name, process.argv[2] ?? "fleetcrown")))
    .limit(1);
  if (!project) throw new Error("No project found — pass name as argv[2]");

  const result = await assembleInjectPrompt({
    userId: project.userId,
    projectKey: project.name,
    projectPath: `/home/g/dev/${project.name}`,
    projectId: project.id,
    adapter: "claude",
    promptKey: "next_best",
  });
  if (!result.ok) throw new Error(`assemble failed: ${result.error}`);
  if (!result.prompt.includes("Project context & goals")) {
    throw new Error("assembled prompt missing project context block");
  }
  if (result.prompt.includes("next_best") && result.prompt.length < 200) {
    throw new Error("assembled prompt looks like a bare promptKey, not a full template");
  }
  console.log("OK — inject prompt assembly");
  console.log("label:", result.promptLabel);
  console.log("length:", result.prompt.length);
  console.log("preview:", result.prompt.slice(0, 280).replace(/\n/g, " "));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});

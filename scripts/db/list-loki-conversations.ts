/** One-off — list recent Loki conversations + last messages. */
import { db } from "../../src/db";
import { conversations, conversationMessages } from "../../src/db/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const convs = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(10);
  console.log(`conversations: ${convs.length}\n`);
  for (const c of convs) {
    const msgs = await db
      .select({
        role: conversationMessages.role,
        kind: conversationMessages.kind,
        content: conversationMessages.content,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, c.id))
      .orderBy(conversationMessages.createdAt)
      .limit(8);
    console.log(`--- ${c.title}`);
    console.log(`    projects: ${(c.projectKeys ?? []).join(", ") || "(none)"}`);
    console.log(`    updated: ${c.updatedAt?.toISOString?.() ?? "?"}`);
    for (const m of msgs) {
      const preview = (m.content ?? "").replace(/\s+/g, " ").slice(0, 140);
      console.log(`    [${m.role}/${m.kind ?? "-"}] ${preview}`);
    }
    if (msgs.length >= 8) console.log("    ...");
    console.log();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

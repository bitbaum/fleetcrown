import { PageLayout } from "@/components/ui/page-layout";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";
import { PromptLibraryClient } from "@/components/prompts/PromptLibraryClient";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export default async function PromptsPage() {
  const projects = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.userId, DEFAULT_USER_ID), eq(entities.type, ENTITY_TYPE.PROJECT)))
    .orderBy(entities.name);

  return (
    <PageLayout
      title="Prompt Library"
      subtitle={`${PROMPT_TEMPLATES.length} templates · engineering, design, business, research`}
    >
      <PromptLibraryClient templates={PROMPT_TEMPLATES} projects={projects} />
    </PageLayout>
  );
}

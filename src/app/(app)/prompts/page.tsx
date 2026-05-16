import { PageLayout } from "@/components/ui/page-layout";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";
import { PromptLibraryClient } from "@/components/prompts/PromptLibraryClient";
import { getCurrentUserId } from "@/lib/session";
import { getProjects } from "@/db/queries/projects";

export const metadata = { title: "Prompts" };

export default async function PromptsPage() {
  const userId = await getCurrentUserId();
  const projects = await getProjects(userId);

  return (
    <PageLayout
      title="Prompt Library"
      subtitle={`${PROMPT_TEMPLATES.length} templates · fleet control, security, engineering, design, business`}
    >
      <PromptLibraryClient templates={PROMPT_TEMPLATES} projects={projects} />
    </PageLayout>
  );
}

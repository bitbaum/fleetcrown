import { PageLayout } from "@/components/ui/page-layout";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";
import { PromptLibraryClient } from "@/components/prompts/PromptLibraryClient";
import { requirePageUserId } from "@/lib/session";
import { getProjects, getOrgEntityProjects } from "@/db/queries/projects";

export const metadata = { title: "Prompts" };

export default async function PromptsPage() {
  const userId = await requirePageUserId();
  const [ownProjects, orgProjects] = await Promise.all([
    getProjects(userId),
    getOrgEntityProjects(userId),
  ]);
  const projects = [...ownProjects, ...orgProjects];

  return (
    <PageLayout
      title="Prompt Library"
      subtitle={`${PROMPT_TEMPLATES.length} templates · fleet control, security, engineering, design, business`}
    >
      <PromptLibraryClient templates={PROMPT_TEMPLATES} projects={projects} />
    </PageLayout>
  );
}

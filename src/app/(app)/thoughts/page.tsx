import { PageLayout } from "@/components/ui/page-layout";
import { ThoughtsLibrary } from "@/components/thoughts/ThoughtsLibrary";
import { listThoughtTags, listThoughts } from "@/lib/thoughts-content";

export const metadata = { title: "Thoughts" };

export default function ThoughtsPage() {
  const articles = listThoughts();
  const tags = listThoughtTags();

  return (
    <PageLayout
      title="Thoughts"
      subtitle="Essays on architecture, execution systems, and project momentum"
      maxWidth="max-w-6xl"
    >
      <ThoughtsLibrary articles={articles} tags={tags} />
    </PageLayout>
  );
}

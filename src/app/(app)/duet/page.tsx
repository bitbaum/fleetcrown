import { PageLayout } from "@/components/ui/page-layout";
import { DuetView } from "@/components/duet/DuetView";
import { requirePageUserId } from "@/lib/session";
import { getUserProjects } from "@/db/queries/user-projects";
import { getLastPromptByProjectKey } from "@/db/queries/prompt-history";

export const metadata = { title: "Duet" };

// Watch two agents side by side. Server-seeds both panes so the view is useful
// on first paint with zero clicks; the client then keeps each pane live off the
// bridge. `?a=&b=` pins the pair (shareable/bookmarkable).
export default async function DuetPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const userId = await requirePageUserId();
  const { a, b } = await searchParams;

  const projects = await getUserProjects(userId);
  const names = projects.map((p) => p.name);

  // Default to the first two registered projects when the URL doesn't pin them.
  const keyA = a ?? names[0] ?? null;
  const keyB = b ?? names[1] ?? names[0] ?? null;

  const [promptA, promptB] = await Promise.all([
    keyA ? getLastPromptByProjectKey(userId, keyA) : Promise.resolve(null),
    keyB ? getLastPromptByProjectKey(userId, keyB) : Promise.resolve(null),
  ]);

  return (
    <PageLayout
      title="Duet"
      subtitle="Watch two agents side by side — the last prompt each one received, updating live."
      maxWidth="max-w-6xl"
    >
      <DuetView
        projects={names}
        initial={{
          a: { projectKey: keyA, prompt: promptA },
          b: { projectKey: keyB, prompt: promptB },
        }}
      />
    </PageLayout>
  );
}

import { PageLayout } from "@/components/ui/page-layout";
import { FilmsWorkspace } from "@/components/films/FilmsWorkspace";
import { listFilms } from "@/db/queries/films";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "Films" };

export default async function FilmsPage() {
  const userId = await requirePageUserId();
  const films = await listFilms(userId);

  return (
    <PageLayout
      title="Films"
      subtitle="Write the screenplay, cut it into clips a model can render, put it back together."
      maxWidth="max-w-4xl"
    >
      <FilmsWorkspace films={films} />
    </PageLayout>
  );
}

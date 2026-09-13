import { notFound } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { FilmWorkspaceView } from "@/components/films/FilmWorkspaceView";
import { getFilm } from "@/db/queries/films";
import { requirePageUserId } from "@/lib/session";
import { isValidUuid } from "@/lib/utils";

export const metadata = { title: "Film" };

export default async function FilmPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requirePageUserId();
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const detail = await getFilm(userId, id);
  if (!detail) notFound();

  return (
    <PageLayout
      title={detail.film.title}
      back={{ href: "/films", label: "Films" }}
      maxWidth="max-w-4xl"
    >
      <FilmWorkspaceView
        initialFilm={detail.film}
        initialScenes={detail.scenes}
        initialShots={detail.shots}
      />
    </PageLayout>
  );
}

import { notFound } from "next/navigation";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";
import { ProjectDossierView } from "@/components/projects/ProjectDossierView";
import { getSharedProjectDossier } from "@/db/queries/project-dossier";

export const metadata = { title: "Shared project" };

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedProjectDossier(token).catch(() => null);
  if (!shared) notFound();

  return (
    <PublicSurface right={<PublicHeaderActions />} showNav={false}>
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <ProjectDossierView dossier={shared.dossier} share={shared.share} />
      </main>
    </PublicSurface>
  );
}

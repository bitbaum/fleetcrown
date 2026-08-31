import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { NAV } from "@/config/navigation";
import { requirePageUserId } from "@/lib/session";
import { getAtlasRow } from "@/db/queries/atlas";
import { getGuides } from "@/db/queries/site-guides";
import { isValidUuid } from "@/lib/utils";
import { SitePages } from "@/components/atlas/SitePages";
import { SiteGuides } from "@/components/atlas/SiteGuides";

export const metadata = { title: "Site" };

export default async function AtlasProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const userId = await requirePageUserId();
  const { projectId } = await params;
  if (!isValidUuid(projectId)) notFound();

  const row = await getAtlasRow(userId, projectId);
  if (!row) notFound();

  const guides = await getGuides(userId, projectId);

  return (
    <PageLayout
      title={row.name}
      subtitle={
        row.liveUrl
          ? "Its pages, and the guides you have written for it."
          : "No site registered yet — add a live URL on the project."
      }
      maxWidth="max-w-4xl"
      right={
        <Link
          href={row.entityId ? `/projects/${row.entityId}` : NAV.projects.href}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Project
        </Link>
      }
    >
      <div className="space-y-6">
        <SitePages
          liveUrl={row.liveUrl}
          paths={row.snapshot?.internalPaths ?? []}
          checkedAt={
            row.snapshot?.checkedAt ? new Date(row.snapshot.checkedAt).toISOString() : null
          }
        />
        <SiteGuides projectId={projectId} liveUrl={row.liveUrl} initialGuides={guides} />
      </div>
    </PageLayout>
  );
}

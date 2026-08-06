import { PageLayout } from "@/components/ui/page-layout";
import { requirePageUserId } from "@/lib/session";
import { getAtlasRows } from "@/db/queries/atlas";
import { AtlasView } from "@/components/atlas/AtlasView";

export const metadata = { title: "Atlas" };

export default async function AtlasPage() {
  const userId = await requirePageUserId();
  const rows = await getAtlasRows(userId);

  return (
    <PageLayout
      title="Atlas"
      subtitle="Every site you run — live status, preview, and how they link to each other."
      maxWidth="max-w-6xl"
    >
      <AtlasView initialRows={rows} />
    </PageLayout>
  );
}

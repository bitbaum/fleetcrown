import { PageLayout } from "@/components/ui/page-layout";
import { searchPeople, SORT_MODE } from "@/db/queries/people";
import { PeopleGrid } from "@/components/people/PeopleGrid";
import { RELATIONSHIP_HEALTH_VALUES, type RelationshipHealth } from "@/lib/constants/people";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string; q?: string; sort?: string }>;
}) {
  const params = await searchParams;

  // Parse health filter from URL (e.g. ?health=fading%2Cstale)
  const initialHealthFilter: RelationshipHealth[] = params.health
    ? params.health
        .split(",")
        .filter((v): v is RelationshipHealth =>
          RELATIONSHIP_HEALTH_VALUES.includes(v as RelationshipHealth),
        )
    : [];

  const userId = await requirePageUserId();
  const { people, total } = await searchPeople(userId, "", 50, 0, SORT_MODE.RECENT, initialHealthFilter);

  return (
    <PageLayout
      title="People"
      subtitle={`${total} private profiles. Enrich and merge first — nothing is sent.`}
      maxWidth="max-w-5xl"
    >
      <PeopleGrid
        initialPeople={people}
        initialTotal={total}
        initialHealthFilter={initialHealthFilter}
      />
    </PageLayout>
  );
}

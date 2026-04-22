import { PageLayout } from "@/components/ui/page-layout";
import { searchPeople } from "@/db/queries/people";
import { PeopleGrid } from "@/components/people/PeopleGrid";
import { NewPersonButton } from "@/components/people/NewPersonButton";

export default async function PeoplePage() {
  const { people, total } = await searchPeople("", 50, 0, "recent");

  return (
    <PageLayout
      title="People"
      subtitle={`Your social graph — ${total} contacts with context`}
      maxWidth="max-w-5xl"
      right={<NewPersonButton />}
    >
      <PeopleGrid initialPeople={people} initialTotal={total} />
    </PageLayout>
  );
}

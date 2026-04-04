import { searchPeople } from "@/db/queries/people";
import { PeopleGrid } from "@/components/people/PeopleGrid";

export default async function PeoplePage() {
  const { people, total } = await searchPeople("", 50, 0);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-sm text-white/40 mt-1">
          Your social graph — {total} contacts with context
        </p>
      </div>

      <PeopleGrid initialPeople={people} initialTotal={total} />
    </div>
  );
}

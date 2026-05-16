import { Repeat2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getTodayHabits } from "@/db/queries/habits";
import { requirePageUserId } from "@/lib/session";
import Link from "next/link";
import { HabitsList } from "./HabitsList";

export async function HabitsCard() {
  const userId = await requirePageUserId();
  const habits = await getTodayHabits(userId);

  const done = habits.filter((h) => h.doneToday).length;
  const allDone = habits.length > 0 && done === habits.length;

  return (
    <Card id="habits">
      <CardHeader
        icon={Repeat2}
        title="Habits"
        right={
          habits.length > 0
            ? <span className={`text-xs ${allDone ? "text-status-positive font-medium" : "text-text-tertiary"}`}>{done}/{habits.length} today</span>
            : null
        }
      />
      <HabitsList initialHabits={habits} />
      {habits.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border-subtle">
          <Link href="/habits" className="ui-link-subtle">
            Open Habits →
          </Link>
        </div>
      )}
    </Card>
  );
}

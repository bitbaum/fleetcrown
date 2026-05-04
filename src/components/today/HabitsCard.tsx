import { Repeat2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getTodayHabits } from "@/db/queries/habits";
import { getCurrentUserId } from "@/lib/session";
import { HabitsList } from "./HabitsList";

export async function HabitsCard() {
  const userId = await getCurrentUserId();
  const habits = await getTodayHabits(userId);

  return (
    <Card>
      <CardHeader
        icon={Repeat2}
        title="Habits"
        right={
          habits.length > 0
            ? <span className="text-xs text-white/30">{habits.filter((h) => h.doneToday).length}/{habits.length} today</span>
            : null
        }
      />
      <HabitsList initialHabits={habits} />
    </Card>
  );
}

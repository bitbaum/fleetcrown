import { Calendar, Clock, ExternalLink } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getEventsDueSoon } from "@/db/queries/events";
import { isPast, format } from "date-fns";
import { deadlineLabel } from "@/lib/dates";
import { EVENTS_DUE_SOON_DAYS } from "@/lib/constants";
import Link from "next/link";

export async function EventsDueCard() {
  const items = await getEventsDueSoon();

  if (items.length === 0) return null;

  const overdueCount = items.filter((e) => e.deadline && isPast(new Date(e.deadline))).length;

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Calendar}
          title="Upcoming Deadlines"
          right={
            overdueCount > 0 ? (
              <span className="text-xs text-red-400 font-medium">{overdueCount} overdue</span>
            ) : (
              <span className="text-xs text-amber-400 font-medium">
                {items.length} within {EVENTS_DUE_SOON_DAYS} days
              </span>
            )
          }
        />
        <div className="space-y-3">
          {items.map((event) => {
            const deadline = new Date(event.deadline!);
            const { label: deadlineText, overdue } = deadlineLabel(deadline);

            return (
              <div key={event.id} className="flex items-start gap-3">
                <div className="shrink-0 flex flex-col items-center gap-1 w-14 pt-0.5">
                  <span className={`text-[11px] font-mono font-medium ${overdue ? "text-red-400" : "text-white/40"}`}>
                    {format(deadline, "d MMM")}
                  </span>
                  {event.category && (
                    <span className="text-[11px] uppercase tracking-wide text-emerald-400/60 font-medium">
                      {event.category}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    <span className="text-sm font-medium leading-snug">{event.name}</span>
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-white/20 hover:text-white/60 transition-colors mt-0.5"
                        title="Open link"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 text-xs mt-0.5 ${overdue ? "text-red-400" : "text-amber-400/70"}`}>
                    <Clock className="h-3 w-3 shrink-0" />
                    {deadlineText}
                  </div>
                  {event.type && (
                    <span className="text-[11px] text-white/40 uppercase tracking-wide">{event.type}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-white/[0.05]">
          <Link href="/events" className="text-xs text-white/40 hover:text-white/70 transition-colors">
            Open Events →
          </Link>
        </div>
      </Card>
    </div>
  );
}

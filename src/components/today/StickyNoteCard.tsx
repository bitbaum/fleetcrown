import { StickyNote } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { listCaptures, countCaptures } from "@/db/queries/captures";
import { requirePageUserId } from "@/lib/session";
import { StickyNoteList } from "./StickyNoteList";

// The sticky note is where walk-mode thoughts land ("add X to my list" to
// Loki, or typed here) and where they get reviewed and checked off at the
// desk. Captures were write-only before this card existed — a list you can
// add to but never see again is not a list.
export async function StickyNoteCard() {
  const userId = await requirePageUserId();
  const [items, total] = await Promise.all([
    listCaptures(userId, 20),
    countCaptures(userId),
  ]);

  return (
    <div id="sticky-note" className="scroll-mt-20">
      <Card>
        <CardHeader
          icon={StickyNote}
          title="Sticky note"
          right={
            <span className="text-xs md:text-sm text-text-tertiary">
              {total} open
            </span>
          }
        />
        <StickyNoteList
          initial={items.map((c) => ({ id: c.id, body: c.body }))}
          hiddenCount={Math.max(0, total - items.length)}
        />
      </Card>
    </div>
  );
}

import { Inbox, Send, Calendar, CheckCircle, MessageCircle, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getPendingActions } from "@/db/queries/actions";
import { type ActionPayload } from "@/db/schema/actions";
import { ACTION_TYPE, type ActionType } from "@/lib/constants/statuses";
import { ActionButtons } from "./ActionButtons";

const TYPE_ICONS: Record<ActionType, typeof Send> = {
  [ACTION_TYPE.SEND_MESSAGE]:      MessageCircle,
  [ACTION_TYPE.SEND_EMAIL]:        Send,
  [ACTION_TYPE.CREATE_EVENT]:      Calendar,
  [ACTION_TYPE.CREATE_COMMITMENT]: CheckCircle,
  [ACTION_TYPE.FOLLOW_UP]:         MessageCircle,
  [ACTION_TYPE.OTHER]:             Inbox,
};

type ActionGroup = {
  type: string;
  reasoning: string;
  actions: Array<{ id: string; title: string; payload: ActionPayload | null }>;
};

function groupSimilarActions(
  actions: Awaited<ReturnType<typeof getPendingActions>>,
): { groups: ActionGroup[]; standalone: typeof actions } {
  // Group "Check in with X" actions (same type + same reasoning pattern)
  const checkins: typeof actions = [];
  const standalone: typeof actions = [];

  for (const a of actions) {
    if (a.type === ACTION_TYPE.SEND_MESSAGE && a.title.startsWith("Check in with ")) {
      checkins.push(a);
    } else {
      standalone.push(a);
    }
  }

  const groups: ActionGroup[] = [];
  if (checkins.length > 1) {
    groups.push({
      type: ACTION_TYPE.SEND_MESSAGE,
      reasoning: "No interaction in 30+ days. Maintaining relationships matters.",
      actions: checkins.map((a) => ({
        id: a.id,
        title: a.title.replace("Check in with ", ""),
        payload: a.payload,
      })),
    });
  } else {
    standalone.push(...checkins);
  }

  return { groups, standalone };
}

export async function ActionQueueCard() {
  const pending = await getPendingActions();

  if (pending.length === 0) return null;

  const { groups, standalone } = groupSimilarActions(pending);

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Inbox}
          title="Action Queue"
          right={
            <span className="text-xs text-amber-400 font-medium">
              {pending.length} pending
            </span>
          }
        />
        <div className="space-y-3">
          {/* Grouped check-ins */}
          {groups.map((group, gi) => (
            <div
              key={`group-${gi}`}
              className="border border-white/10 rounded-md p-3 bg-white/[0.02]"
            >
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-white/40 shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm md:text-base font-medium">
                    Check in with {group.actions.length} people
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {group.actions.map((a) => {
                      const body = a.payload?.body ? String(a.payload.body) : null;
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded bg-white/[0.02]">
                          <div className="min-w-0">
                            <span className="text-sm md:text-base">{a.title}</span>
                            {body && (
                              <div className="text-xs text-white/30 truncate mt-0.5">{body}</div>
                            )}
                          </div>
                          <ActionButtons actionId={a.id} compact />
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs md:text-sm text-white/30 mt-2 italic">
                    Ivy: {group.reasoning}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Standalone actions */}
          {standalone.map((action) => {
            const Icon = TYPE_ICONS[action.type] ?? Inbox;
            const payload = action.payload;

            return (
              <div
                key={action.id}
                className="border border-white/10 rounded-md p-3 bg-white/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 text-white/40 shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm md:text-base font-medium">{action.title}</div>

                    {payload?.to != null && (
                      <div className="text-xs md:text-sm text-white/40 mt-0.5">
                        {"To: "}{String(payload.to)}
                        {payload.channel != null ? ` via ${String(payload.channel)}` : ""}
                      </div>
                    )}

                    {(payload?.body != null || payload?.subject != null) && (
                      <div className="mt-2 p-2 rounded bg-white/[0.03] border border-white/5">
                        {payload?.subject != null && (
                          <div className="text-xs font-medium text-white/60 mb-1">
                            {"Subject: "}{String(payload.subject)}
                          </div>
                        )}
                        <pre className="text-xs text-white/50 whitespace-pre-wrap">
                          {String(payload?.body ?? "")}
                        </pre>
                      </div>
                    )}

                    {action.reasoning && (
                      <div className="text-xs md:text-sm text-white/30 mt-2 italic">
                        Ivy: {action.reasoning}
                      </div>
                    )}

                    <ActionButtons actionId={action.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

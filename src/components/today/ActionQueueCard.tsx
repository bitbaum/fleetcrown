import { Inbox, Send, Calendar, CheckCircle, MessageCircle, Users, Check, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getPendingActions, getRecentActions, type ActionRow } from "@/db/queries/actions";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { type ActionPayload } from "@/db/schema/actions";
import { ACTION_TYPE, ACTION_STATUS, type ActionType } from "@/lib/constants/statuses";
import { ActionButtons } from "./ActionButtons";
import { ApproveGroupButton } from "./ApproveGroupButton";
import { HEALTH_ACTIVE_DAYS } from "@/lib/constants/people";
import { compactRelativeDate } from "@/lib/dates";

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
  actions: ActionRow[],
): { groups: ActionGroup[]; standalone: ActionRow[] } {
  // Group "Check in with X" actions (same type + same reasoning pattern)
  const checkins: ActionRow[] = [];
  const standalone: ActionRow[] = [];

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
      reasoning: `No interaction in ${HEALTH_ACTIVE_DAYS}+ days. Maintaining relationships matters.`,
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
  const userId = await requirePageUserId();
  // Actions reference contacts ("Check in with X") and other private-zone
  // entities. Hide the whole card when the zone is locked.
  if (await isPrivateZoneLocked(userId)) {
    return null;
  }
  const [pending, recent] = await Promise.all([
    getPendingActions(userId),
    getRecentActions(userId, 5),
  ]);

  if (pending.length === 0 && recent.length === 0) return null;

  if (pending.length === 0) {
    return (
      <div id="actions" className="md:col-span-2">
        <Card>
          <CardHeader icon={Inbox} title="Action Queue" />
          <div className="space-y-1.5">
            {recent.map((action) => {
              const done = action.status === ACTION_STATUS.APPROVED || action.status === ACTION_STATUS.EXECUTED;
              return (
                <div key={action.id} className="flex items-center gap-3 px-1 py-1 rounded">
                  {done
                    ? <Check className="h-3.5 w-3.5 text-status-positive shrink-0" />
                    : <X className="h-3.5 w-3.5 text-text-muted shrink-0" />}
                  <span className="flex-1 truncate text-sm text-text-secondary" title={action.title}>{action.title}</span>
                  {action.reviewedAt && (
                    <span className="text-xs text-text-tertiary shrink-0">
                      {compactRelativeDate(action.reviewedAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  const { groups, standalone } = groupSimilarActions(pending);

  return (
    <div id="actions" className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Inbox}
          title="Action Queue"
          right={
            <span className="text-xs text-status-warning font-medium">
              {pending.length} pending
            </span>
          }
        />
        <div className="space-y-3">
          {/* Grouped check-ins */}
          {groups.map((group, gi) => (
            <div
              key={`group-${gi}`}
              className="border border-border-subtle rounded-md p-3 bg-surface-base"
            >
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-text-tertiary shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm md:text-base font-medium">
                      Check in with {group.actions.length} people
                    </div>
                    <ApproveGroupButton ids={group.actions.map((a) => a.id)} />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {group.actions.map((a) => {
                      const body = a.payload?.body ? String(a.payload.body) : null;
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded bg-surface-base">
                          <div className="min-w-0">
                            <span className="text-sm md:text-base">{a.title}</span>
                            {body && (
                              <div className="text-xs text-text-secondary mt-0.5">{body}</div>
                            )}
                          </div>
                          <ActionButtons actionId={a.id} compact />
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs md:text-sm text-text-secondary mt-2 italic">
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
                className="border border-border-subtle rounded-md p-3 bg-surface-base"
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 text-text-tertiary shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm md:text-base font-medium">{action.title}</div>

                    {payload?.to != null && (
                      <div className="text-xs md:text-sm text-text-tertiary mt-0.5">
                        {"To: "}{String(payload.to)}
                        {payload.channel != null ? ` via ${String(payload.channel)}` : ""}
                      </div>
                    )}

                    {(payload?.body != null || payload?.subject != null) && (
                      <div className="mt-2 p-2 rounded bg-surface-base border border-border-subtle">
                        {payload?.subject != null && (
                          <div className="text-xs font-medium text-text-secondary mb-1">
                            {"Subject: "}{String(payload.subject)}
                          </div>
                        )}
                        <pre className="text-xs text-text-secondary whitespace-pre-wrap">
                          {String(payload?.body ?? "")}
                        </pre>
                      </div>
                    )}

                    {action.reasoning && (
                      <div className="text-xs md:text-sm text-text-secondary mt-2 italic">
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

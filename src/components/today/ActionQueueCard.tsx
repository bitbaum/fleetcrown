import { Inbox, Send, Calendar, CheckCircle, MessageCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getPendingActions } from "@/db/queries/actions";
import { ActionButtons } from "./ActionButtons";

const TYPE_ICONS: Record<string, typeof Send> = {
  send_message: MessageCircle,
  send_email: Send,
  create_event: Calendar,
  create_commitment: CheckCircle,
  follow_up: MessageCircle,
};

export async function ActionQueueCard() {
  const pending = await getPendingActions();

  if (pending.length === 0) return null;

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Inbox}
          title="Action Queue"
          right={
            <span className="text-xs text-amber-400 font-medium">
              {pending.length} pending review
            </span>
          }
        />
        <div className="space-y-3">
          {pending.map((action) => {
            const Icon = TYPE_ICONS[action.type] ?? Inbox;
            const payload = action.payload as Record<string, unknown> | null;

            return (
              <div
                key={action.id}
                className="border border-white/10 rounded-md p-3 bg-white/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 text-white/40 shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{action.title}</div>

                    {/* Show recipient and channel */}
                    {payload?.to != null && (
                      <div className="text-xs text-white/40 mt-0.5">
                        {"To: "}{String(payload.to)}
                        {payload.channel != null ? ` via ${String(payload.channel)}` : ""}
                      </div>
                    )}

                    {/* Show the actual content to review */}
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

                    {/* Why Ivy suggests this */}
                    {action.reasoning && (
                      <div className="text-xs text-white/30 mt-2 italic">
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

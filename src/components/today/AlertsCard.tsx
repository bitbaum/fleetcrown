import { Bell, AlertTriangle, Info, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getActiveAlerts } from "@/db/queries/alerts";
import { requirePageUserId } from "@/lib/session";
import { DismissAlertButton } from "./DismissAlertButton";
import Link from "next/link";
import { ALERT_SEVERITY } from "@/lib/constants/statuses";

const SEVERITY_CONFIG = {
  urgent: { icon: AlertCircle, color: "text-status-negative", bg: "bg-status-negative-subtle", border: "border-status-negative/20" },
  warning: { icon: AlertTriangle, color: "text-status-warning", bg: "bg-status-warning-subtle", border: "border-status-warning/20" },
  info: { icon: Info, color: "text-accent-text", bg: "bg-accent-muted", border: "border-accent-primary/20" },
} as const;

export async function AlertsCard() {
  const userId = await requirePageUserId();
  const items = await getActiveAlerts(userId);

  if (items.length === 0) return null;

  const urgentCount = items.filter((a) => a.severity === ALERT_SEVERITY.URGENT).length;

  return (
    <div id="alerts" className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Bell}
          title="Alerts"
          right={
            urgentCount > 0 ? (
              <span className="text-xs md:text-sm text-status-negative font-medium">{urgentCount} urgent</span>
            ) : (
              <span className="text-xs md:text-sm text-text-tertiary">{items.length} active</span>
            )
          }
        />
        <div className="space-y-2">
          {items.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
            const Icon = config.icon;
            return (
              <div
                key={alert.id}
                className={`flex gap-3 items-start p-2 rounded-md ${config.bg} border ${config.border}`}
              >
                <Icon className={`h-4 w-4 md:h-5 md:w-5 ${config.color} shrink-0 mt-0.5`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm md:text-base font-medium">{alert.title}</div>
                  {alert.description && (
                    <div className="text-xs md:text-sm text-text-secondary mt-0.5">{alert.description}</div>
                  )}
                  {alert.actionUrl && (
                    <Link
                      href={alert.actionUrl}
                      className={`inline-flex items-center gap-1 text-xs mt-1 ${config.color} opacity-70 hover:opacity-100 transition-opacity`}
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <DismissAlertButton alertId={alert.id} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

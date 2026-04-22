import { Bell, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getActiveAlerts } from "@/db/queries/alerts";
import { DismissAlertButton } from "./DismissAlertButton";

const SEVERITY_CONFIG = {
  urgent: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
} as const;

export async function AlertsCard() {
  const items = await getActiveAlerts();

  if (items.length === 0) return null;

  const urgentCount = items.filter((a) => a.severity === "urgent").length;

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Bell}
          title="Alerts"
          right={
            urgentCount > 0 ? (
              <span className="text-xs md:text-sm text-red-400 font-medium">{urgentCount} urgent</span>
            ) : (
              <span className="text-xs md:text-sm text-white/30">{items.length} active</span>
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
                    <div className="text-xs md:text-sm text-white/50 mt-0.5">{alert.description}</div>
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

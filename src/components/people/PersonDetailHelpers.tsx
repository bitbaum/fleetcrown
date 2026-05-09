import { MessageCircle } from "lucide-react";
import { CHANNEL_CONFIG } from "@/config/channels";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="ui-kicker">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function ChannelIcon({ channel }: { channel: string }) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return <MessageCircle className="h-3.5 w-3.5 text-text-tertiary" />;
  const Icon = config.icon;
  return <Icon className={`h-3.5 w-3.5 ${config.color}`} />;
}

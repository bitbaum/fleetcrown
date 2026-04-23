import { MessageCircle } from "lucide-react";
import { CHANNEL_CONFIG } from "@/config/channels";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function ChannelIcon({ channel }: { channel: string }) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return <MessageCircle className="h-3.5 w-3.5 text-white/30" />;
  const Icon = config.icon;
  return <Icon className={`h-3.5 w-3.5 ${config.color}`} />;
}

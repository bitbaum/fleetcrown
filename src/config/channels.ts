import { MessageCircle, Mail, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ChannelConfig = {
  icon: LucideIcon;
  label: string;
  color: string;
};

export const CHANNEL_CONFIG: Record<string, ChannelConfig> = {
  "channel:whatsapp": { icon: MessageCircle, label: "WhatsApp", color: "text-green-400/60" },
  "channel:telegram": { icon: Send, label: "Telegram", color: "text-blue-400/60" },
  "channel:email": { icon: Mail, label: "Email", color: "text-white/40" },
};

import { MessageCircle, Mail, Send, Phone, Users, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ChannelConfig = {
  icon: LucideIcon;
  label: string;
  color: string;
};

export const CHANNEL_CONFIG: Record<string, ChannelConfig> = {
  "channel:whatsapp":  { icon: MessageCircle, label: "WhatsApp",  color: "text-green-400/60" },
  "channel:telegram":  { icon: Send,          label: "Telegram",  color: "text-blue-400/60" },
  "channel:email":     { icon: Mail,          label: "Email",     color: "text-white/40" },
  "channel:phone":     { icon: Phone,         label: "Phone",     color: "text-cyan-400/60" },
  "channel:in-person": { icon: Users,         label: "In person", color: "text-violet-400/60" },
  "channel:other":     { icon: HelpCircle,    label: "Other",     color: "text-white/30" },
};

/** Bare channel names (without "channel:" prefix), derived from CHANNEL_CONFIG — single source of truth */
export const CHANNEL_NAMES = Object.keys(CHANNEL_CONFIG).map((k) => k.replace("channel:", ""));

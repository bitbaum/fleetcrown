import { MessageCircle, Mail, Send, Phone, Users, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Prefix used to mark a person attribute as a contact channel. */
const CHANNEL_ATTR_PREFIX = "channel:";

type ChannelConfig = {
  icon: LucideIcon;
  label: string;
  color: string;
};

export const CHANNEL_CONFIG: Record<string, ChannelConfig> = {
  "channel:whatsapp":  { icon: MessageCircle, label: "WhatsApp",  color: "text-green-400/60" },
  "channel:telegram":  { icon: Send,          label: "Telegram",  color: "text-blue-400/60" },
  "channel:email":     { icon: Mail,          label: "Email",     color: "text-text-tertiary" },
  "channel:phone":     { icon: Phone,         label: "Phone",     color: "text-cyan-400/60" },
  "channel:in-person": { icon: Users,         label: "In person", color: "text-violet-400/60" },
  "channel:other":     { icon: HelpCircle,    label: "Other",     color: "text-text-muted" },
};

/** Whether a person-attr key marks a contact channel. */
export function isChannelAttrKey(key: string): boolean {
  return key.startsWith(CHANNEL_ATTR_PREFIX);
}

/** "channel:whatsapp" → "whatsapp". Safe to call on already-bare names. */
export function stripChannelPrefix(key: string): string {
  return key.startsWith(CHANNEL_ATTR_PREFIX) ? key.slice(CHANNEL_ATTR_PREFIX.length) : key;
}

/** "whatsapp" → "channel:whatsapp". Safe to call on already-prefixed keys. */
export function withChannelPrefix(name: string): string {
  return name.startsWith(CHANNEL_ATTR_PREFIX) ? name : `${CHANNEL_ATTR_PREFIX}${name}`;
}

/** Bare channel names (without "channel:" prefix), derived from CHANNEL_CONFIG — single source of truth */
export const CHANNEL_NAMES = Object.keys(CHANNEL_CONFIG).map(stripChannelPrefix);

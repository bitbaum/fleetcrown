import { CHANNEL_CONFIG, isChannelAttrKey } from "@/config/channels";
import { ACTION_COPY } from "@/config/action-copy";
import { compactRelativeDate } from "@/lib/dates";

export type ReachChannel = { label: string; value: string };

export function reachChannels(attrs: Record<string, string>): ReachChannel[] {
  const out: ReachChannel[] = [];
  for (const [key, raw] of Object.entries(attrs)) {
    if (!isChannelAttrKey(key) || !raw.trim()) continue;
    const cfg = CHANNEL_CONFIG[key];
    out.push({
      label: cfg?.label ?? key.replace(/^channel:/, ""),
      value: raw.replace(/^e164:/, ""),
    });
  }
  return out;
}

export function lastTalkLabel(lastInteraction: Date | null): string {
  if (!lastInteraction) return ACTION_COPY.checkin.never;
  return ACTION_COPY.checkin.last(compactRelativeDate(lastInteraction));
}

/** Digits only, for wa.me / tel. Empty if there is no number. */
export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function whatsappHref(phone: string, text?: string): string | null {
  const digits = phoneDigits(phone);
  if (digits.length < 8) return null;
  const base = `https://wa.me/${digits}`;
  return text?.trim() ? `${base}?text=${encodeURIComponent(text.trim())}` : base;
}

export function mailtoHref(email: string, subject?: string, body?: string): string | null {
  const to = email.trim();
  if (!to.includes("@")) return null;
  const q = new URLSearchParams();
  if (subject?.trim()) q.set("subject", subject.trim());
  if (body?.trim()) q.set("body", body.trim());
  const qs = q.toString();
  return qs ? `mailto:${to}?${qs}` : `mailto:${to}`;
}

import { CHANNEL_CONFIG, isChannelAttrKey } from "@/config/channels";
import { ACTION_COPY } from "@/config/action-copy";
import { compactRelativeDate } from "@/lib/dates";

/** `href` is null for a channel you cannot open from a browser (in person), or
 *  when the stored value is not usable (a 3-digit "phone", an email with no @). */
export type ReachChannel = { label: string; value: string; href: string | null };

/**
 * Build the link for one channel. Exported because TWO surfaces render a
 * contact value — Today's check-in row and the People detail panel — and the
 * first version of this change only fixed the first, which is how a fix
 * becomes an instance instead of a class.
 *
 * Every href is assembled from a FIXED scheme plus a sanitised fragment —
 * never the raw attribute. A person attribute is user-entered text, and
 * dropping it into an href unfiltered is how `javascript:` ends up one click
 * away from the operator.
 *
 * `key` is the prefixed attr key (`channel:email`); pass one through
 * withChannelPrefix() if you hold the bare name.
 */
export function channelHref(key: string, value: string): string | null {
  switch (key) {
    case "channel:whatsapp":
      return whatsappHref(value);
    case "channel:email":
      return mailtoHref(value);
    case "channel:phone": {
      const digits = phoneDigits(value);
      return digits.length >= 6 ? `tel:+${digits}` : null;
    }
    case "channel:telegram": {
      // Handles only. A t.me link built from a phone number is a different
      // thing (an invite), and guessing between them silently opens the wrong
      // chat — better no link than the wrong person.
      const handle = value.trim().replace(/^@/, "");
      return /^[A-Za-z0-9_]{5,32}$/.test(handle) ? `https://t.me/${handle}` : null;
    }
    default:
      // in-person, other, and anything a future config adds: no link until
      // someone decides what opening it should mean.
      return null;
  }
}

export function reachChannels(attrs: Record<string, string>): ReachChannel[] {
  const out: ReachChannel[] = [];
  for (const [key, raw] of Object.entries(attrs)) {
    if (!isChannelAttrKey(key) || !raw.trim()) continue;
    const cfg = CHANNEL_CONFIG[key];
    const value = raw.replace(/^e164:/, "");
    out.push({
      label: cfg?.label ?? key.replace(/^channel:/, ""),
      value,
      href: channelHref(key, value),
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

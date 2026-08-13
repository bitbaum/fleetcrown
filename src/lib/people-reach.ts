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

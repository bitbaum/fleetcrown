import { shortTimeAgo } from "@/lib/dates";

/**
 * "just now" / "5m ago" / "3d ago" — an elapsed label that reads as English at
 * every age.
 *
 * `shortTimeAgo` returns the bare token "now" for anything under a minute, so
 * every caller that wrapped it as `${shortTimeAgo(t)} ago` printed "now ago"
 * for the first minute — which is exactly the minute right after a check, the
 * one a user is most likely to be looking at. Fixing it at each call site would
 * leave the next caller to rediscover it, so the phrasing lives here once.
 */
export function agoLabel(ms: number): string {
  const short = shortTimeAgo(ms);
  return short === "now" ? "just now" : `${short} ago`;
}

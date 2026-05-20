/**
 * Single source of truth for name → initials. Pure function, no React, so it
 * works in both server (OG image generators, RSC) and client (Avatar fallback)
 * contexts — neither marks itself "use client" / "use server" since the
 * function is universal.
 *
 * "George Butaev" → "GB"
 * "George"        → "GE"  (first two letters of a single word)
 * ""              → "?"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

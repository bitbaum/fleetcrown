"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Avatar with an initials-circle fallback when the image fails to load
 * (broken src, 404, CORS, blocked). Renders a single component everywhere
 * profile pictures show so the broken-image icon never leaks to users.
 *
 * Pass `name` to drive the initials — for "George Butaev" → "GB", single
 * word → "GE" (first two letters), empty → "?". Image-only callers can
 * pass `name=""` to force the placeholder.
 */
type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 32, md: 48, lg: 72 };
const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-18 w-18 text-2xl",
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: Size;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dim = SIZE_PX[size];
  const sizeCls = SIZE_CLASS[size];

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt={name}
        width={dim}
        height={dim}
        className={`${sizeCls} shrink-0 rounded-full ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeCls} shrink-0 items-center justify-center rounded-full bg-accent-muted font-semibold text-accent-text ${className}`}
      aria-label={`Avatar for ${name}`}
    >
      {getInitials(name)}
    </div>
  );
}

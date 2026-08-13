"use client";

import Image from "next/image";
import { useState } from "react";
import { getInitials } from "@/lib/initials";

// Re-export so existing `from "@/components/shared/Avatar"` imports keep working.
// New server-side callers should import directly from "@/lib/initials".
export { getInitials };

/**
 * Avatar with an initials-circle fallback when the image fails to load
 * (broken src, 404, CORS, blocked). Renders a single component everywhere
 * profile pictures show so the broken-image icon never leaks to users.
 *
 * Pass `name` to drive the initials — for "Mao Nakamoto" → "MN", single
 * word → "MA" (first two letters), empty → "?". Image-only callers can
 * pass `name=""` to force the placeholder.
 */
type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 32, md: 48, lg: 72 };
const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-18 w-18 text-2xl",
};

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
        // Avatars come from whichever identity provider the user signed in
        // with — GitHub, Google, X, OrangeCat — and the optimizer refuses any
        // host not in next.config's remotePatterns. There were no patterns at
        // all, so EVERY remote avatar 400ed ("url parameter is not allowed")
        // and quietly fell back to initials: nobody's photo has ever rendered,
        // and nothing surfaced it because the fallback looks intentional.
        //
        // Unoptimized rather than an allowlist because the host set is not
        // ours to enumerate — it grows every time a provider is added, and the
        // breakage is invisible by construction. These are 32-72px images that
        // the optimizer would save nothing on.
        unoptimized
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

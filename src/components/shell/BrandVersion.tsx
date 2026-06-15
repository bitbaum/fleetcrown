"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

// Build identity baked in at compile time (see next.config.ts). SHA is the
// precise "which build is this"; the semver is the marketing version.
const SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * Version stamp shown under the sidebar logo. Clicking it opens the changelog
 * (/releases).
 *
 * Why it's runtime-aware: the desktop app (Fleet Runner) just wraps the web UI
 * and tags its User-Agent with `FleetRunner/<ver>`. So:
 *   - In the browser → "build <sha>" (this web deployment).
 *   - In Fleet Runner → "Fleet Runner <ver> · <sha>" — the desktop app version
 *     AND the web build it's currently showing.
 * That makes the web-vs-desktop difference explicit: when the desktop loads a
 * deployed build that lags your local server, the two SHAs simply differ.
 */
/** Read the Fleet Runner version from the User-Agent — client-only, with a
 *  null server snapshot so SSR/hydration match (no setState-in-effect). */
const noopSubscribe = () => () => {};
function clientDesktopVersion(): string | null {
  const m = navigator.userAgent.match(/FleetRunner\/([\d.]+)/i);
  return m ? m[1] : null;
}

export function BrandVersion() {
  const desktopVersion = useSyncExternalStore(
    noopSubscribe,
    clientDesktopVersion,
    () => null,
  );

  const label = desktopVersion ? `Fleet Runner ${desktopVersion} · ${SHA}` : `build ${SHA}`;
  const tooltip = desktopVersion
    ? `Fleet Runner ${desktopVersion} (desktop) · web build ${SHA} · v${VERSION} — view changelog`
    : `Web build ${SHA} · v${VERSION} — view changelog`;

  return (
    <Link
      href="/releases"
      title={tooltip}
      className="mt-1.5 block truncate text-micro text-text-muted transition-colors hover:text-text-secondary"
    >
      {label}
    </Link>
  );
}

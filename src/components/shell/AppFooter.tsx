import Link from "next/link";
import { NAV } from "@/config/navigation";

const COMMIT_SHA = (
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  ""
).slice(0, 7);

const ENV_LABEL =
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  process.env.VERCEL_ENV ??
  (process.env.NODE_ENV === "production" ? "prod" : "local");

/**
 * Micro footer — desktop only (mobile uses MobileNav). Ambient signals: the
 * runtime environment and the deployed commit. Counterweight to the sidebar
 * so the app surface has a defined top and bottom; not a content slot.
 */
export function AppFooter() {
  return (
    <footer className="ui-app-footer">
      <span className="ui-app-footer-cell">
        <span className="ui-app-footer-dot" aria-hidden="true" />
        <span>{ENV_LABEL}</span>
      </span>
      {COMMIT_SHA && (
        <span className="ui-app-footer-cell" title="Deployed commit">
          {COMMIT_SHA}
        </span>
      )}
      <span className="ml-auto">
        <Link href={NAV.system.href} className="ui-app-footer-cell">System</Link>
      </span>
    </footer>
  );
}
